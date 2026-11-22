/* 个人中心 —— REQ-USER-01~05：资料偏好 · 模型管理 · 用量 · 订阅计费 · 安全 */
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Icon from '../components/Icon';
import { Confirm, Modal, Tabs, Tag, useToast } from '../components/ui';
import { useAuth } from '../stores/auth';
import {
  buildPayReturnUrl,
  clearPendingOrder,
  isAbortError,
  isPaidStatus,
  openCashierWindow,
  PAY_REQUEST_TIMEOUT_MS,
  readPendingOrder,
  savePendingOrder,
  submitPaymentHtml,
} from '../utils/alipay';
import { BillingSection } from './account/BillingSection';
import { ModelsSection } from './account/ModelsSection';
import { ProfileSection } from './account/ProfileSection';
import { SecuritySection } from './account/SecuritySection';
import { TeamSection } from './account/TeamSection';
import { AddModelModal } from './chat/AddModelModal';
import { UsageSection } from './account/UsageSection';

export default function Account() {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'profile');

  /* 资料 */
  const [form, setForm] = useState<any>({});
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  /* 模型 */
  const [models, setModels] = useState<{ builtin: any[]; custom: any[] }>({ builtin: [], custom: [] });
  const [addOpen, setAddOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<any>(null);

  /* 用量 */
  const [usage, setUsage] = useState<any>(null);
  const [range, setRange] = useState(30);

  /* 订阅与支付宝收银台 */
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<any>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payingState, setPayingState] = useState<{ outTradeNo: string; isPolling: boolean } | null>(null);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);

  /* 安全 */
  const [security, setSecurity] = useState<any>(null);
  const [delAccountOpen, setDelAccountOpen] = useState(false);
  const [delConfirmText, setDelConfirmText] = useState('');

  useEffect(() => {
    const p = { name: user?.name || '', title: user?.title || '', research_tags: user?.research_tags || [] };
    setForm(p);
  }, [user]);

  const loadInitData = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api<{ builtin: any[]; custom: any[] }>('/models'),
        api<any>('/account/security'),
      ]);
      setModels(m || { builtin: [], custom: [] });
      setSecurity(s);
    } catch (err: any) {
      toast(err.message || '加载账户数据失败', 'err');
    }
  }, [toast]);

  useEffect(() => {
    loadInitData();
  }, [loadInitData]);

  useEffect(() => {
    if (tab === 'usage') {
      api<any>('/usage', { params: { range } }).then(setUsage).catch(() => { });
    }
  }, [tab, range]);

  const loadBilling = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        api<any[]>('/billing/plans'),
        api<any>('/billing/subscription'),
      ]);
      setPlans(p || []);
      setSubscription(s);
    } catch {
      // 容错
    }
  }, []);

  useEffect(() => {
    if (tab === 'billing') {
      loadBilling();
    }
  }, [tab, loadBilling]);

  /* ===== 资料保存 ===== */
  const saveProfile = async () => {
    setSaving(true);
    try {
      await api('/user/profile', { method: 'PUT', body: form });
      await refresh();
      toast('资料已更新');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!form.research_tags?.includes(t)) {
      setForm({ ...form, research_tags: [...(form.research_tags || []), t] });
    }
    setTagInput('');
  };

  /* ===== 模型管理 ===== */
  const testModel = async (id: string) => {
    setTesting(id);
    try {
      const r = await api<any>(`/models/${id}/test`, { method: 'POST' });
      if (!r.success) {
        setModels((x) => ({
          builtin: x.builtin.map((m) => (m.id === id ? { ...m, status: 'untested' } : m)),
          custom: x.custom.map((m) => (m.id === id ? { ...m, status: 'untested' } : m)),
        }));
        return toast(r.sample || '模型未配置或连通失败', 'err');
      }
      setModels((x) => ({
        builtin: x.builtin.map((m) => (m.id === id ? { ...m, status: 'connected' } : m)),
        custom: x.custom.map((m) => (m.id === id ? { ...m, status: 'connected' } : m)),
      }));
      toast(`连通正常 · ${r.latency_ms}ms`);
    } catch (err: any) {
      toast(err?.message || '模型连通测试失败', 'err');
    } finally {
      setTesting(null);
    }
  };

  const delModel = async () => {
    await api(`/models/${delTarget.id}`, { method: 'DELETE' });
    setModels((x) => ({ ...x, custom: x.custom.filter((m) => m.id !== delTarget.id) }));
    toast('模型已删除');
  };

  /* ===== 订阅与支付宝支付 ===== */
  const buy = useCallback((planId: string) => {
    if (planId === 'enterprise') {
      setEnterpriseOpen(true);
      return;
    }
    const target = plans.find((p) => p.id === planId) || {
      id: planId,
      name: planId === 'team' ? '课题组尊享版' : '科研进阶版',
      price: planId === 'team' ? 199 : 19.9,
      period: '月',
    };
    setCheckoutPlan(target);
    setPayingState(null);
  }, [plans]);

  /* 检查 URL 中的支付宝回跳结果与直达购买参数 */
  useEffect(() => {
    const pendingTradeNo = readPendingOrder();
    const returnTradeNo = searchParams.get('out_trade_no') || pendingTradeNo;
    const payResult = searchParams.get('pay_result');
    const autoBuyPlan = searchParams.get('buy') || searchParams.get('plan');

    if (returnTradeNo) {
      api<any>(`/payment/alipay/query?out_trade_no=${encodeURIComponent(returnTradeNo)}`)
        .then(async (res) => {
          if (res && isPaidStatus(res.trade_status)) {
            toast('🎉 支付宝支付成功，已为您开通套餐！');
            await loadBilling();
            await refresh();
          } else {
            toast('正在核对支付宝付款结果，请稍候查看', 'info');
          }
        })
        .catch(() => { })
        .finally(() => {
          clearPendingOrder();
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('out_trade_no');
          newParams.delete('pay_result');
          newParams.delete('trade_no');
          setSearchParams(newParams, { replace: true });
        });
    } else if (payResult) {
      // 支付完成但未透传到订单号时，仍然刷新一次权益
      clearPendingOrder();
      Promise.all([loadBilling(), refresh()]).catch(() => { });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('pay_result');
      setSearchParams(newParams, { replace: true });
    } else if (autoBuyPlan && plans.length > 0) {
      buy(autoBuyPlan);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('buy');
      newParams.delete('plan');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, plans, buy, loadBilling, refresh, setSearchParams, toast]);

  /* 拉起支付宝官方收银台 */
  const handleAlipayPay = async () => {
    if (!checkoutPlan) return;

    // 收银台窗口必须在点击的同步阶段打开，等接口返回再开会被浏览器拦截
    const cashierWindow = openCashierWindow();
    setPayLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PAY_REQUEST_TIMEOUT_MS);

    try {
      const res = await api<any>('/payment/alipay/page-pay', {
        method: 'POST',
        body: { plan_id: checkoutPlan.id, return_url: buildPayReturnUrl() },
        signal: controller.signal,
      });

      if (!res?.payment_html) {
        throw new Error('未获取到支付表单，请稍后重试');
      }

      savePendingOrder(res.out_trade_no);
      setPayingState({ outTradeNo: res.out_trade_no, isPolling: true });
      submitPaymentHtml(res.payment_html, cashierWindow);
    } catch (err: any) {
      try {
        cashierWindow?.close();
      } catch (_) { }
      clearPendingOrder();
      if (isAbortError(err)) {
        toast('创建收银台超时，请检查网络后重试', 'err');
      } else {
        toast(err?.message || '创建支付宝支付订单失败', 'err');
      }
    } finally {
      clearTimeout(timeoutId);
      setPayLoading(false);
    }
  };

  /* 轮询支付状态 */
  useEffect(() => {
    if (!payingState?.outTradeNo || !payingState?.isPolling) return;
    let count = 0;
    const maxPoll = 40; // 40 * 2.5s = 100秒

    const timer = setInterval(async () => {
      count += 1;
      if (count > maxPoll) {
        clearInterval(timer);
        setPayingState((s) => (s ? { ...s, isPolling: false } : null));
        return;
      }
      try {
        const queryRes = await api<any>(`/payment/alipay/query?out_trade_no=${encodeURIComponent(payingState.outTradeNo)}`);
        if (queryRes && isPaidStatus(queryRes.trade_status)) {
          clearInterval(timer);
          clearPendingOrder();
          toast('🎉 支付宝支付成功，已为您开通套餐！');
          setPayingState(null);
          setCheckoutPlan(null);
          await loadBilling();
          await refresh();
        }
      } catch {
        // 静默
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [payingState?.outTradeNo, payingState?.isPolling, loadBilling, refresh, toast]);

  const manualCheckPayment = async () => {
    if (!payingState?.outTradeNo) return;
    try {
      const queryRes = await api<any>(`/payment/alipay/query?out_trade_no=${encodeURIComponent(payingState.outTradeNo)}`);
      if (queryRes && isPaidStatus(queryRes.trade_status)) {
        clearPendingOrder();
        toast('🎉 支付宝支付成功，已为您开通套餐！');
        setPayingState(null);
        setCheckoutPlan(null);
        await loadBilling();
        await refresh();
      } else {
        toast('暂未核销到支付结果，若已付款请稍等片刻后再次点击', 'info');
      }
    } catch (e: any) {
      toast(e?.message || '查询支付状态失败', 'err');
    }
  };

  /* ===== 安全 ===== */
  const toggle2FA = async (on: boolean) => {
    await api('/account/2fa', { method: 'POST', body: { enabled: on } });
    setSecurity({ ...security, two_factor: { ...security.two_factor, enabled: on } });
    toast(on ? '两步验证已开启' : '两步验证已关闭');
  };

  const exportData = async () => {
    await api('/account/export', { method: 'POST' });
    toast('导出任务已创建，完成后可下载');
  };

  const deleteAccount = async () => {
    await api('/account', { method: 'DELETE', body: { confirm: 'DELETE' } });
    setDelAccountOpen(false);
    toast('注销申请已提交，7 天冷静期内可撤销');
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ flex: 'none' }}>
        <div className="row g-3 wrap">
          <div className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>
            {user?.name?.[0] || '研'}
          </div>
          <div className="grow" style={{ minWidth: 180 }}>
            <div className="fw-bold text-serif" style={{ fontSize: 16 }}>{user?.name}</div>
            <div className="row g-1 mt-1 wrap">
              <Tag color="amber">
                {subscription?.plan_name || (user?.plan === 'pro' ? 'Pro 专业版' : 'Free 免费版')}
              </Tag>
              <Tag color="gray">{user?.title}</Tag>
              <span className="text-xs text-muted">{user?.email}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          const newParams = new URLSearchParams(searchParams);
          newParams.set('tab', t);
          newParams.delete('buy');
          newParams.delete('plan');
          setSearchParams(newParams, { replace: true });
        }}
        tabs={[
          { key: 'profile', label: <><Icon name="user" size={13} /> 资料偏好</> },
          { key: 'models', label: <><Icon name="cpu" size={13} /> 模型管理</> },
          { key: 'usage', label: <><Icon name="chart" size={13} /> 用量统计</> },
          { key: 'billing', label: <><Icon name="card" size={13} /> 订阅计费</> },
          { key: 'security', label: <><Icon name="shield" size={13} /> 安全</> },
        ]}
      />

      {/* ===== 资料偏好（课题组显示在昵称上方） ===== */}
      {tab === 'profile' && (
        <>
          <TeamSection />
          <ProfileSection
            form={form}
            setForm={setForm}
            tagInput={tagInput}
            setTagInput={setTagInput}
            saving={saving}
            onSave={saveProfile}
            onAddTag={addTag}
          />
        </>
      )}

      {/* ===== 模型管理 ===== */}
      {tab === 'models' && (
        <ModelsSection
          models={models}
          testing={testing}
          onOpenAdd={() => setAddOpen(true)}
          onTestModel={testModel}
          onSelectDelete={setDelTarget}
        />
      )}

      {/* ===== 用量统计 ===== */}
      {tab === 'usage' && (
        <UsageSection
          usage={usage}
          range={range}
          onRangeChange={setRange}
        />
      )}

      {/* ===== 订阅计费 ===== */}
      {tab === 'billing' && subscription && (
        <BillingSection
          subscription={subscription}
          plans={plans}
          onBuy={buy}
        />
      )}

      {/* ===== 安全 ===== */}
      {tab === 'security' && security && (
        <SecuritySection
          security={security}
          onToggle2FA={toggle2FA}
          onExportData={exportData}
          onOpenDelAccount={() => setDelAccountOpen(true)}
        />
      )}

      {/* ===== 添加模型模态（与 AI 工作台共用：测试连通通过才保存）===== */}
      <AddModelModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(m) => setModels((x) => ({ ...x, custom: [...x.custom, m] }))}
      />

      {/* ===== 支付宝安全收银台模态框 ===== */}
      <Modal
        open={!!checkoutPlan}
        onClose={() => {
          if (!payLoading) {
            setCheckoutPlan(null);
            setPayingState(null);
          }
        }}
        title={<><Icon name="alipay" size={17} style={{ color: '#1677ff' }} /> 订阅订单确认</>}
        footer={
          payingState ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPayingState(null);
                  setCheckoutPlan(null);
                }}
              >
                关闭
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleAlipayPay}
                disabled={payLoading}
              >
                重新拉起支付
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#1677ff', borderColor: '#1677ff' }}
                onClick={manualCheckPayment}
              >
                我已完成支付
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setCheckoutPlan(null)}
                disabled={payLoading}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#1677ff', borderColor: '#1677ff' }}
                onClick={handleAlipayPay}
                disabled={payLoading}
              >
                {payLoading ? '正在创建收银台...' : `前往支付宝支付 ¥${checkoutPlan?.price}`}
              </button>
            </>
          )
        }
      >
        {checkoutPlan && !payingState && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="kv">
              <span className="kv-k">订阅方案</span>
              <span className="kv-v fw-bold">{checkoutPlan.name}</span>
            </div>
            <div className="kv">
              <span className="kv-k">计费周期</span>
              <span className="kv-v">按{checkoutPlan.period || '月'}开通 · 随时可退</span>
            </div>
            <div className="kv">
              <span className="kv-k">应付金额</span>
              <span className="kv-v mono fw-bold" style={{ fontSize: 20, color: '#1677ff' }}>
                ¥{checkoutPlan.price}
              </span>
            </div>

            <div style={{
              marginTop: 6,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid rgba(22, 119, 255, 0.3)',
              background: 'rgba(22, 119, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexShrink: 0,
              }}>
                <Icon name="alipay" size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                  支付宝官方安全支付 (Alipay)
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  支持手机支付宝扫码与电脑端快捷付款，实时开通权益
                </div>
              </div>
              <Icon name="check" size={16} style={{ color: '#1677ff' }} />
            </div>

            <p className="text-xs text-muted" style={{ lineHeight: 1.6, marginTop: 4 }}>
              点击后将打开支付宝官方安全收银台完成付款；若浏览器拦截新窗口，会在当前标签页继续跳转。付款完成后系统将自动同步权益。
            </p>
          </div>
        )}

        {payingState && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(22, 119, 255, 0.1)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1677ff',
              marginBottom: 14,
            }}>
              <Icon name="alipay" size={32} />
            </div>
            <div className="fw-bold" style={{ fontSize: 16 }}>已为您打开支付宝收银台</div>
            <p className="text-xs text-muted mt-2" style={{ maxWidth: 360, margin: '8px auto 0', lineHeight: 1.6 }}>
              商户订单号：<span className="mono">{payingState.outTradeNo}</span><br />
              请在弹出的支付宝页面完成扫码或登录支付。付款完成后，请点击下方「我已完成支付」。
            </p>
          </div>
        )}
      </Modal>

      {/* ===== 机构私有版咨询模态框 ===== */}
      <Modal
        open={enterpriseOpen}
        onClose={() => setEnterpriseOpen(false)}
        title={<><Icon name="shield" size={16} /> 咨询机构私有版方案</>}
        footer={<button className="btn btn-primary" onClick={() => setEnterpriseOpen(false)}>我知道了</button>}
      >
        <div style={{ lineHeight: 1.8, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p>
            <b>机构私有版</b> 面向高校院所、重点实验室与企业研发中心，支持单机或 K8s 集群本地化私有部署、集成 Qwen / GLM 等本地模型与数据中心算力，并提供专属审计与 Skill 智能体定制开发。
          </p>
          <div className="card card-pad" style={{ background: 'var(--bg-sub)', padding: 12 }}>
            <div>📧 机构专属咨询邮箱：<b>contact@sciencex.cn</b></div>
            <div className="mt-1">💬 技术顾问微信：<b>ScienceX-Enterprise</b></div>
            <div className="mt-1">⏱️ 专属团队将在 2 小时内响应并提供定制方案方案书与技术支持。</div>
          </div>
        </div>
      </Modal>

      <Confirm
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={delModel}
        danger
        title="删除模型"
        text={`确定删除自定义模型「${delTarget?.name}」？删除后相关对话将回退到默认模型。`}
      />

      <Modal
        open={delAccountOpen}
        onClose={() => { setDelAccountOpen(false); setDelConfirmText(''); }}
        title={<><Icon name="alert" size={15} /> 注销账号</>}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setDelAccountOpen(false); setDelConfirmText(''); }}>取消</button>
            <button className="btn btn-danger" disabled={delConfirmText !== 'DELETE'} onClick={deleteAccount}>确认注销</button>
          </>
        }
      >
        <p className="text-small mb-2" style={{ lineHeight: 1.8 }}>
          ⚠️ 注销后所有数据（文献库、稿件、实验记录、订阅）将在 7 天冷静期后<b>永久删除且不可恢复</b>。
          请输入 <code className="mono">DELETE</code> 以确认：
        </p>
        <input className="input" value={delConfirmText} onChange={(e) => setDelConfirmText(e.target.value)} placeholder="DELETE" />
      </Modal>
    </div>
  );
}
