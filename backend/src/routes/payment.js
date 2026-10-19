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
 * 1. 创建订单并获取支付宝支付页面表单 (alipay.trade.page.pay)
 * POST /api/v1/payment/alipay/page-pay
 */
router.post('/payment/alipay/page-pay', auth, async (req, res) => {
  try {
    const { plan_id, return_url } = req.body || {};
    const plan = store.plans.find((p) => p.id === plan_id);
    if (!plan) return errors.notFound(res, '套餐不存在');

    const outTradeNo = `SX${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const totalAmount = Number(plan.price).toFixed(2);
    const subject = `ScienceX 科研工作台 - ${plan.name}`;

    // 同步回跳地址：优先使用请求体传入，否则使用默认前端页面
    const defaultReturnUrl = return_url || 'http://localhost:5173/account?tab=billing&pay_result=return';

    // 记录订单到本地存储
    const order = {
      id: store.id('o'),
      owner_id: req.user.id,
      order_no: outTradeNo,
      out_trade_no: outTradeNo,
      plan: plan.name,
      amount: Number(totalAmount),
      total_amount: totalAmount,
      pay_status: 'pending',
      period: plan.period,
      created_at: store.now(),
    };
    store.orders.unshift(order);

    const paymentFormHtml = createPagePay({
      outTradeNo,
      totalAmount,
      subject,
      returnUrl: defaultReturnUrl,
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

    // 3. 幂等更新订单状态
    const isPaid = params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED';
    if (isPaid) {
      if (order.pay_status !== 'paid') {
        order.pay_status = 'paid';
        order.trade_no = params.trade_no;
        order.paid_at = store.now();
        order.notify_raw = params;
        console.log(`[Alipay Notify] 订单 ${order.out_trade_no} 状态已更新为 paid`);
      }
    } else if (params.trade_status === 'TRADE_CLOSED') {
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
 */
router.get('/payment/alipay/return', (req, res) => {
  const { out_trade_no, trade_no, total_amount } = req.query;
  const order = store.orders.find((o) => o.out_trade_no === out_trade_no || o.order_no === out_trade_no);
  
  // 同步通知不直接确认为支付成功，需结合主动查询确认
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>ScienceX - 支付返回处理中</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
          .card { background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155; text-align: center; max-width: 400px; }
          h2 { color: #10b981; margin-bottom: 1rem; }
          p { color: #94a3b8; font-size: 14px; }
          .btn { display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.5rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>支付请求已提交</h2>
          <p>商户订单号: ${out_trade_no || '未知'}</p>
          <p>支付宝交易号: ${trade_no || '未知'}</p>
          <p>金额: ¥${total_amount || '0.00'}</p>
          <p>系统正在通过异步通知与主动查询核对支付结果，请返回工作台查看最新状态。</p>
          <a class="btn" href="/account?tab=billing">返回个人中心</a>
        </div>
      </body>
    </html>
  `;
  res.type('text/html').send(html);
});

/**
 * 4. 统一收单交易查询 (alipay.trade.query)
 * GET /api/v1/payment/alipay/query
 */
router.get('/payment/alipay/query', auth, async (req, res) => {
  try {
    const { out_trade_no, trade_no } = req.query;
    if (!out_trade_no && !trade_no) {
      return errors.param(res, 'out_trade_no 与 trade_no 至少提供一项');
    }

    const result = await queryTrade({ outTradeNo: out_trade_no, tradeNo: trade_no });
    
    // 同步更新本地订单状态兜底
    if (result && result.code === '10000') {
      const order = store.orders.find((o) => o.out_trade_no === result.out_trade_no || o.order_no === result.out_trade_no);
      if (order && (result.trade_status === 'TRADE_SUCCESS' || result.trade_status === 'TRADE_FINISHED')) {
        order.pay_status = 'paid';
        order.trade_no = result.trade_no;
      }
    }

    ok(res, result, '查询成功');
  } catch (error) {
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
