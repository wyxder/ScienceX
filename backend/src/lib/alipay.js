const path = require('path');
const fs = require('fs');
const { AlipaySdk } = require('alipay-sdk');

let cachedConfig = null;
let cachedSdk = null;

function getAlipayConfig() {
  if (cachedConfig) return cachedConfig;

  const sandboxConfigPath = path.resolve(__dirname, '../../.alipay-sandbox.json');
  if (fs.existsSync(sandboxConfigPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(sandboxConfigPath, 'utf8'));
      const app = raw.appIds && raw.appIds[0];
      if (app) {
        cachedConfig = {
          appId: app.appId,
          // Node.js SDK 必须使用 PKCS#1 私钥
          privateKey: app.appPrivatePkcsKey || app.appPrivateKey,
          alipayPublicKey: app.alipayPublicKey,
          gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
          signType: 'RSA2',
          sellerId: app.pid || (raw.sandboxAccounts && raw.sandboxAccounts.partner && raw.sandboxAccounts.partner.userId),
          isSandbox: true,
        };
        return cachedConfig;
      }
    } catch (err) {
      console.error('[Alipay] 读取 .alipay-sandbox.json 失败:', err);
    }
  }

  // 生产环境从环境变量读取
  cachedConfig = {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
    signType: 'RSA2',
    sellerId: process.env.ALIPAY_SELLER_ID || '',
    isSandbox: false,
  };
  return cachedConfig;
}

function getAlipaySdk() {
  if (cachedSdk) return cachedSdk;
  const config = getAlipayConfig();
  if (!config.appId || !config.privateKey) {
    throw new Error('支付宝配置缺失：未找到有效的 AppId 或私钥');
  }
  cachedSdk = new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: config.gateway,
    signType: config.signType,
  });
  return cachedSdk;
}

/**
 * 1. 统一收单下单并支付页面接口 (alipay.trade.page.pay)
 * ⚠️ 网站支付必须使用 pageExec() 方法，传 'POST'，返回包含自动提交脚本的 HTML 表单字符串
 */
function createPagePay({ outTradeNo, totalAmount, subject, returnUrl, notifyUrl }) {
  const alipaySdk = getAlipaySdk();
  const requestOptions = {
    bizContent: {
      out_trade_no: outTradeNo,
      total_amount: Number(totalAmount).toFixed(2),
      subject: subject || 'ScienceX 订阅服务',
      product_code: 'FAST_INSTANT_TRADE_PAY',
    },
  };

  if (returnUrl) {
    requestOptions.returnUrl = returnUrl;
  }
  const effectiveNotifyUrl = (notifyUrl || process.env.ALIPAY_NOTIFY_URL || '').trim();
  if (effectiveNotifyUrl) {
    requestOptions.notifyUrl = effectiveNotifyUrl;
  }

  return alipaySdk.pageExec('alipay.trade.page.pay', 'POST', requestOptions);
}

/**
 * 2. 统一收单交易查询接口 (alipay.trade.query)
 */
async function queryTrade({ outTradeNo, tradeNo }) {
  const alipaySdk = getAlipaySdk();
  const bizContent = {};
  if (outTradeNo) bizContent.out_trade_no = outTradeNo;
  if (tradeNo) bizContent.trade_no = tradeNo;

  return alipaySdk.exec('alipay.trade.query', { bizContent });
}

/**
 * 3. 统一收单交易退款接口 (alipay.trade.refund)
 */
async function refundTrade({ outTradeNo, tradeNo, refundAmount, refundReason, outRequestNo }) {
  const alipaySdk = getAlipaySdk();
  const bizContent = {
    refund_amount: Number(refundAmount).toFixed(2),
  };
  if (outTradeNo) bizContent.out_trade_no = outTradeNo;
  if (tradeNo) bizContent.trade_no = tradeNo;
  if (refundReason) bizContent.refund_reason = refundReason;
  if (outRequestNo) bizContent.out_request_no = outRequestNo;

  return alipaySdk.exec('alipay.trade.refund', { bizContent });
}

/**
 * 4. 统一收单交易退款查询接口 (alipay.trade.fastpay.refund.query)
 */
async function queryRefund({ outTradeNo, tradeNo, outRequestNo }) {
  const alipaySdk = getAlipaySdk();
  const bizContent = {
    out_request_no: outRequestNo,
  };
  if (outTradeNo) bizContent.out_trade_no = outTradeNo;
  if (tradeNo) bizContent.trade_no = tradeNo;

  return alipaySdk.exec('alipay.trade.fastpay.refund.query', { bizContent });
}

/**
 * 5. 统一收单交易关闭接口 (alipay.trade.close)
 */
async function closeTrade({ outTradeNo, tradeNo, operatorId }) {
  const alipaySdk = getAlipaySdk();
  const bizContent = {};
  if (outTradeNo) bizContent.out_trade_no = outTradeNo;
  if (tradeNo) bizContent.trade_no = tradeNo;
  if (operatorId) bizContent.operator_id = operatorId;

  return alipaySdk.exec('alipay.trade.close', { bizContent });
}

/**
 * 6. 异步通知验签 (checkNotifySignV2)
 */
function verifyNotifySign(params) {
  const alipaySdk = getAlipaySdk();
  if (typeof alipaySdk.checkNotifySignV2 === 'function') {
    return alipaySdk.checkNotifySignV2(params);
  }
  return alipaySdk.checkNotifySign(params);
}

module.exports = {
  getAlipayConfig,
  getAlipaySdk,
  createPagePay,
  queryTrade,
  refundTrade,
  queryRefund,
  closeTrade,
  verifyNotifySign,
};
