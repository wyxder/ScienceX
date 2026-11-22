/* 支付宝收银台支付流程通用工具：请求超时、新窗口兜底提交、订单号跨页核销 */

export const PAY_REQUEST_TIMEOUT_MS = 20000;
const PENDING_KEY = 'sx_pending_pay_order';
const PENDING_TTL_MS = 12 * 60 * 60 * 1000;

export function buildPayReturnUrl(): string {
    return `${window.location.origin}/#/account?tab=billing&pay_result=success`;
}

/** 必须在点击事件的同步调用栈里打开，否则会被浏览器拦截 */
export function openCashierWindow(): Window | null {
    try {
        const win = window.open('about:blank', '_blank');
        if (win) {
            try {
                win.document.write(
                    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>支付宝收银台</title></head>' +
                    '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#666">正在创建支付宝收银台…</body></html>'
                );
                win.document.close();
            } catch (_) { }
        }
        return win;
    } catch {
        return null;
    }
}

function submitInCurrentPage(paymentHtml: string): void {
    const containerId = 'sciencex-alipay-checkout-form';
    const old = document.getElementById(containerId);
    if (old) old.remove();

    const container = document.createElement('div');
    container.id = containerId;
    container.style.display = 'none';
    container.innerHTML = paymentHtml;
    document.body.appendChild(container);

    const form = container.querySelector('form');
    if (!form) throw new Error('支付表单解析失败，请稍后重试');
    form.target = '_self';
    form.submit();
}

/** 把支付宝返回的表单写入收银台窗口并提交；窗口不可用时回退到当前页提交 */
export function submitPaymentHtml(paymentHtml: string, win: Window | null): void {
    if (!win || win.closed) {
        submitInCurrentPage(paymentHtml);
        return;
    }

    const formOnly = paymentHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    try {
        win.document.open();
        win.document.write(
            `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>支付宝收银台</title></head><body>${formOnly}</body></html>`
        );
        win.document.close();
        const form = win.document.querySelector('form');
        if (!form) throw new Error('支付表单解析失败');
        form.target = '_self';
        form.submit();
    } catch {
        try {
            win.close();
        } catch (_) { }
        submitInCurrentPage(paymentHtml);
    }
}

export function savePendingOrder(outTradeNo: string): void {
    try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ outTradeNo, ts: Date.now() }));
    } catch (_) { }
}

export function readPendingOrder(): string {
    try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        if (!parsed?.outTradeNo || Date.now() - Number(parsed.ts || 0) > PENDING_TTL_MS) {
            return '';
        }
        return String(parsed.outTradeNo);
    } catch {
        return '';
    }
}

export function clearPendingOrder(): void {
    try {
        sessionStorage.removeItem(PENDING_KEY);
    } catch (_) { }
}

export function isPaidStatus(tradeStatus?: string): boolean {
    return tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED';
}

export function isAbortError(err: any): boolean {
    return err?.name === 'AbortError';
}