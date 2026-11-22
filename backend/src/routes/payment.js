/**
 * 支付宝支付路由模块 (AI 网页应用收款 / 网站支付)
 */
const express = require('express');
const store = require('../lib/store');
const { ok, errors } = require('../lib/respond');
const { auth } = require('./account');
const {
  getAlipayConfig,
  createPagePay,
  queryTrade,
  refundTrade,
  queryRefund,
  closeTrade,
  verifyNotifySign,
} = require('../lib/alipay');

const router = express.Router();

/**
 * 金额文本归一化对比（避免浮点数精度问题）
 */
function normalizeAmountText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return `${BigInt(match[1]).toString()}.${(match[2] || '').padEnd(2, '0')}`;
}

/**
 * 站点对外访问地址（用于生成支付宝同步回跳中转地址）
 */
function resolvePublicOrigin(req) {
  const configured = (process.env.ALIPAY_RETURN_ORIGIN || process.env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 把支付结果写入前端 HashRouter 的地址（参数必须位于 # 之后，否则前端读不到）
 */
function appendPayResult(target, params) {
  const url = new URL(target);
  const hash = url.hash && url.hash.startsWith('#/') ? url.hash.slice(1) : '';
  if (hash) {
    const [path, search] = hash.split('?');
    const query = new URLSearchParams(search || '');
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    url.hash = `#${path}?${query.toString()}`;
  } else {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

/**
 * 支付成功后为用户开通套餐权益
 */
function applyOrderSuccess(order, tradeNo) {
  if (!order) return;
  order.pay_status = 'paid';
  if (tradeNo) order.trade_no = tradeNo;
  if (!order.paid_at) order.paid_at = store.now();

  const plan = store.plans.find((p) => p.id === order.plan_id || p.name === order.plan);
  const planId = plan ? plan.id : (order.plan && order.plan.includes('团队') ? 'team' : 'pro');
  const planName = plan ? plan.name : (order.plan || '科研进阶版');

  const user = store.users.find((u) => u.id === order.owner_id);
  const quota = planId === 'pro'
    ? { chat: 999999, literature: 2000, chart: 500, kb: 50 }
    : planId === 'team'
      ? { chat: 999999, literature: 10000, chart: 2000, kb: 200 }
      : { chat: 50, literature: 20, chart: 0, kb: 1 };
  const expireAt = store.daysAhead(30);
  const price = order.amount != null ? order.amount : (plan ? plan.price : 19.9);
  const period = order.period || (plan ? plan.period : '月');
  if (user) {
    user.plan = planId;
    user.subscription = {
      plan: planId,
      plan_name: planName,
      price,
      period,
      expire_at: expireAt,
      auto_renew: false,
      quota,
      used: user.subscription?.used || { chat: 0, literature: 0, chart: 0, kb: 0 },
    };
  }
  store.subscription.plan = planId;
  store.subscription.plan_name = planName;
  store.subscription.price = price;
  store.subscription.period = period;
  store.subscription.expire_at = expireAt;
  store.subscription.quota = quota;
}

/**
 * 1. 创建订单并获取支付宝支付页面表单 (alipay.trade.page.pay)
 * POST /api/v1/payment/alipay/page-pay
 */
router.post('/payment/alipay/page-pay', auth, async (req, res) => {
  try {
    const { plan_id, return_url } = req.body || {};
    const plan = store.plans.find((p) => p.id === plan_id || p.name === plan_id);
    if (!plan) return errors.notFound(res, '套餐不存在');
    if (!(Number(plan.price) >= 0.01)) return errors.param(res, '该套餐不支持在线支付，请联系客服咨询定制方案');

    const outTradeNo = `SX${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const totalAmount = Number(plan.price).toFixed(2);
    const subject = `ScienceX 科研工作台 - ${plan.name}`;

    const origin = resolvePublicOrigin(req);
    // 同步回跳目的地：优先使用请求体传入的合法地址，否则回到前端订阅页（HashRouter 必须带 #）
    const frontendReturnUrl = isSafeHttpUrl(return_url)
      ? return_url
      : `${origin || 'http://localhost:5173'}/#/account?tab=billing&pay_result=return`;
    // 支付宝回跳先到后端中转，由后端把 order 参数写进 hash 后再跳前端，避免参数落在 # 之前
    const alipayReturnUrl = origin
      ? `${origin}/api/v1/payment/alipay/return?redirect=${encodeURIComponent(frontendReturnUrl)}`
      : frontendReturnUrl;

    // 记录订单到本地存储
    const order = {
      id: store.id('o'),
      owner_id: req.user.id,
      order_no: outTradeNo,
      out_trade_no: outTradeNo,
      plan_id: plan.id,
      plan: plan.name,
      amount: Number(totalAmount),
      total_amount: totalAmount,
      pay_status: 'pending',
      period: plan.period,
      return_url: frontendReturnUrl,
      created_at: store.now(),
    };
    store.orders.unshift(order);

    const paymentFormHtml = createPagePay({
      outTradeNo,
      totalAmount,
      subject,
      returnUrl: alipayReturnUrl,
    });

    ok(res, {
      order,
      out_trade_no: outTradeNo,
      payment_html: paymentFormHtml,
    }, '支付表单已生成');
  } catch (error) {
    console.error('[Payment] 下单并生成支付表单失败:', error);
    errors.server(res, `创建支付失败: ${error.message}`);
  }
});

/**
 * 2. 异步通知接收处理 (notify_url)
 * POST /api/v1/payment/alipay/notify
 * ⚠️ 必须以 application/x-www-form-urlencoded 接收，成功返回纯文本 "success"，失败返回 "fail"
 */
router.post('/payment/alipay/notify', express.urlencoded({ extended: false }), async (req, res) => {
  const params = { ...req.body };
  console.log('[Alipay Notify] 收到异步通知:', params.out_trade_no, params.trade_status);

  try {
    const config = getAlipayConfig();
    // 1. 签名校验
    const isValid = verifyNotifySign(params);
    if (!isValid) {
      console.error('[Alipay Notify] 验签失败:', params.out_trade_no);
      return res.type('text/plain').send('fail');
    }

    // 2. 关键业务字段一致性校验
    // 校验 appId
    if (params.app_id !== config.appId) {
      console.error('[Alipay Notify] app_id 不匹配:', params.app_id, config.appId);
      return res.type('text/plain').send('fail');
    }

    // 校验商户订单是否存在
    const order = store.orders.find((o) => o.out_trade_no === params.out_trade_no || o.order_no === params.out_trade_no);
    if (!order) {
      console.error('[Alipay Notify] 订单未找到:', params.out_trade_no);
      return res.type('text/plain').send('fail');
    }

    // 校验金额
    const expectedAmount = normalizeAmountText(order.total_amount || order.amount);
    const notifyAmount = normalizeAmountText(params.total_amount);
    if (expectedAmount !== notifyAmount) {
      console.error('[Alipay Notify] 金额不一致:', expectedAmount, notifyAmount);
      return res.type('text/plain').send('fail');
    }

    // 校验 seller_id（如果配置了）
    if (config.sellerId && params.seller_id && config.sellerId !== params.seller_id) {
      console.error('[Alipay Notify] seller_id 不匹配:', config.sellerId, params.seller_id);
      return res.type('text/plain').send('fail');
    }

    // 3. 幂等更新订单状态并开通权益
    const isPaid = params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED';
    if (isPaid) {
      if (order.pay_status !== 'paid') {
        applyOrderSuccess(order, params.trade_no);
        console.log(`[Alipay Notify] 订单 ${order.out_trade_no} 状态已更新为 paid，权益已生效`);
      } else if (params.trade_no && !order.trade_no) {
        order.trade_no = params.trade_no;
      }
      order.notify_raw = params;
    } else if (params.trade_status === 'TRADE_CLOSED' && order.pay_status !== 'paid') {
      order.pay_status = 'closed';
    }

    return res.type('text/plain').send('success');
  } catch (error) {
    console.error('[Alipay Notify] 处理异常:', error);
    return res.type('text/plain').send('fail');
  }
});

/**
 * 3. 同步回跳页面 (return_url)
 * GET /api/v1/payment/alipay/return
 * 支付宝回跳参数只能拿到 out_trade_no / trade_no，这里统一转成前端 HashRouter 可识别的地址
 */
router.get('/payment/alipay/return', async (req, res) => {
  const { out_trade_no, trade_no, redirect } = req.query;
  const order = store.orders.find((o) => o.out_trade_no === out_trade_no || o.order_no === out_trade_no);

  let paid = false;
  if (order) {
    try {
      const result = await Promise.race([
        queryTrade({ outTradeNo: out_trade_no, tradeNo: trade_no }),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      if (result && (result.trade_status === 'TRADE_SUCCESS' || result.trade_status === 'TRADE_FINISHED')) {
        applyOrderSuccess(order, result.trade_no || trade_no);
        paid = true;
      }
    } catch (e) {
      console.warn('[Alipay Return] 同步校验查询略过或待轮询:', e.message);
    }
  }
  if (order && order.pay_status === 'paid') paid = true;

  const origin = resolvePublicOrigin(req);
  const fallback = `${origin || 'http://localhost:5173'}/#/account?tab=billing&pay_result=${paid ? 'success' : 'return'}`;
  const target = isSafeHttpUrl(redirect) ? redirect : (order && isSafeHttpUrl(order.return_url) ? order.return_url : fallback);

  return res.redirect(appendPayResult(target, {
    out_trade_no: out_trade_no || '',
    trade_no: trade_no || '',
    pay_result: paid ? 'success' : 'return',
  }));
});

/**
 * 4. 统一收单交易查询 (alipay.trade.query)
 * GET /api/v1/payment/alipay/query
 */
router.get('/payment/alipay/query', auth, async (req, res) => {
  const { out_trade_no, trade_no } = req.query;
  if (!out_trade_no && !trade_no) {
    return errors.param(res, 'out_trade_no 与 trade_no 至少提供一项');
  }

  const localOrder = store.orders.find((o) => o.out_trade_no === (out_trade_no || trade_no) || o.order_no === (out_trade_no || trade_no));
  try {
    const result = await Promise.race([
      queryTrade({ outTradeNo: out_trade_no, tradeNo: trade_no }),
      new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
    ]);

    // 同步更新本地订单状态并生效套餐权益
    if (result && result.code === '10000') {
      if (localOrder && (result.trade_status === 'TRADE_SUCCESS' || result.trade_status === 'TRADE_FINISHED')) {
        applyOrderSuccess(localOrder, result.trade_no);
      }
    }

    // 支付宝查询不可用时，以已入账的本地订单兜底，避免前端误判支付失败
    if ((!result || result.code !== '10000') && localOrder && localOrder.pay_status === 'paid') {
      return ok(res, {
        code: '10000',
        trade_status: 'TRADE_SUCCESS',
        out_trade_no: localOrder.out_trade_no,
        trade_no: localOrder.trade_no || '',
        source: 'local',
      }, '查询成功');
    }

    ok(res, result, '查询成功');
  } catch (error) {
    if (localOrder && localOrder.pay_status === 'paid') {
      return ok(res, {
        code: '10000',
        trade_status: 'TRADE_SUCCESS',
        out_trade_no: localOrder.out_trade_no,
        trade_no: localOrder.trade_no || '',
        source: 'local',
      }, '查询成功');
    }
    console.error('[Payment] 交易查询失败:', error);
    errors.server(res, `交易查询失败: ${error.message}`);
  }
});

/**
 * 5. 统一收单交易退款 (alipay.trade.refund)
 * POST /api/v1/payment/alipay/refund
 */
router.post('/payment/alipay/refund', auth, async (req, res) => {
  try {
    const { out_trade_no, trade_no, refund_amount, refund_reason, out_request_no } = req.body || {};
    if (!out_trade_no && !trade_no) {
      return errors.param(res, 'out_trade_no 或 trade_no 必须提供一项');
    }
    if (!refund_amount) {
      return errors.param(res, 'refund_amount 为必填项');
    }

    const result = await refundTrade({
      outTradeNo: out_trade_no,
      tradeNo: trade_no,
      refundAmount: refund_amount,
      refundReason: refund_reason || '用户申请退款',
      outRequestNo: out_request_no || `RF${Date.now()}`,
    });

    if (result && result.code === '10000') {
      const order = store.orders.find((o) => o.out_trade_no === (out_trade_no || result.out_trade_no));
      if (order) {
        order.pay_status = 'refunded';
      }
    }

    ok(res, result, '退款处理成功');
  } catch (error) {
    console.error('[Payment] 退款失败:', error);
    errors.server(res, `退款失败: ${error.message}`);
  }
});

/**
 * 6. 统一收单交易退款查询 (alipay.trade.fastpay.refund.query)
 * GET /api/v1/payment/alipay/refund/query
 */
router.get('/payment/alipay/refund/query', auth, async (req, res) => {
  try {
    const { out_trade_no, trade_no, out_request_no } = req.query;
    if (!out_request_no) {
      return errors.param(res, 'out_request_no 为必填项');
    }

    const result = await queryRefund({
      outTradeNo: out_trade_no,
      tradeNo: trade_no,
      outRequestNo: out_request_no,
    });

    ok(res, result, '退款查询成功');
  } catch (error) {
    console.error('[Payment] 退款查询失败:', error);
    errors.server(res, `退款查询失败: ${error.message}`);
  }
});

/**
 * 7. 统一收单交易关闭 (alipay.trade.close)
 * POST /api/v1/payment/alipay/close
 */
router.post('/payment/alipay/close', auth, async (req, res) => {
  try {
    const { out_trade_no, trade_no } = req.body || {};
    if (!out_trade_no && !trade_no) {
      return errors.param(res, 'out_trade_no 或 trade_no 必填一项');
    }

    const result = await closeTrade({
      outTradeNo: out_trade_no,
      tradeNo: trade_no,
    });

    if (result && result.code === '10000') {
      const order = store.orders.find((o) => o.out_trade_no === out_trade_no);
      if (order && order.pay_status === 'pending') {
        order.pay_status = 'closed';
      }
    }

    ok(res, result, '交易已关闭');
  } catch (error) {
    console.error('[Payment] 交易关闭失败:', error);
    errors.server(res, `交易关闭失败: ${error.message}`);
  }
});

module.exports = { router };
