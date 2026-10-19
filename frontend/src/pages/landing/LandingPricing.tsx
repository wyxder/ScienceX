import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Modal, useToast } from '../../components/ui';
import { useAuth } from '../../stores/auth';
import { api } from '../../api/client';

const PLANS = [
  { id: 'free', name: '探索版', english: 'FREE', icon: 'bulb', description: '从好奇出发，迈出科研第一步', price: '0', period: '永久免费', audience: '本科毕设 · 科研启蒙', action: '免费开始探索', summary: '开启你的基础科研工具箱', features: ['每日 30 次基础 AI 对话', '文献阅读与思维导图，5 篇 / 月', '基础学术润色与翻译', '自定义接入 OpenAI 模型'] },
  { id: 'pro', name: '科研进阶版', english: 'PRO', icon: 'spark', description: '为每一次论文突破，全力以赴', price: '19.9', period: '/ 月', audience: '硕士博士 · 论文冲刺', action: '开启进阶科研', summary: '让高强度研究，更从容', features: ['无限次对话中枢交互', '三栏文献精读与引用图谱', '自动化消融实验方案矩阵', '专家完整盲审，10 次 / 月', '双通道查重与高保真降重', '一键生成组会汇报 PPTX'] },
  { id: 'team', name: '课题组尊享版', english: 'TEAM', icon: 'users', description: '让个人的发现，成为团队的积累', price: '199', period: '/ 月 · 团队共享', audience: '5–15 人实验室 · 团队协同', action: '开通团队空间', summary: '包含 Pro 全部能力，并提供', features: ['支持 15 位团队成员', '专属共享 RAG 文献知识库', 'GPU 集群监控与任务调度', '导师意见归档与待办分发', '团队项目资产与成果看板'] },
  { id: 'enterprise', name: '机构私有版', english: 'ENTERPRISE', icon: 'shield', description: '让科研能力，扎根你的组织', price: '按需定制', period: '定制方案 · 按年付费', audience: '高校院所 · 企业研发中心', action: '咨询机构方案', summary: '专属部署，支持深度定制', features: ['单机 / K8s 集群本地化部署', 'Qwen、GLM 与本地算力集成', '统一 SSO 与科研数据审计', '专属技术支持', '定制科研 Skill 智能体开发'] },
];

export const LandingPricing: React.FC = () => {
  const nav = useNavigate();
  const toast = useToast();
  const { user, refresh } = useAuth();

  const [checkoutPlan, setCheckoutPlan] = useState<any>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payingState, setPayingState] = useState<{ outTradeNo: string; isPolling: boolean } | null>(null);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);

  const handleAction = (plan: typeof PLANS[0]) => {
    if (plan.id === 'free') {
      if (user) {
        nav('/chat');
      } else {
        nav('/login');
      }
      return;
    }

    if (plan.id === 'enterprise') {
      setEnterpriseOpen(true);
      return;
    }

    // pro 或 team
    if (!user) {
      nav(`/login?redirect=${encodeURIComponent(`/account?tab=billing&buy=${plan.id}`)}`);
      return;
    }

    setCheckoutPlan(plan);
    setPayingState(null);
  };

  const handleAlipayPay = async () => {
    if (!checkoutPlan) return;
    setPayLoading(true);
    try {
      const returnUrl = `${window.location.origin}/account?tab=billing&pay_result=success`;
      const res = await api<any>('/payment/alipay/page-pay', {
        method: 'POST',
        body: { plan_id: checkoutPlan.id, return_url: returnUrl },
      });

      if (!res?.payment_html) {
        throw new Error('未获取到支付表单，请稍后重试');
      }

      setPayingState({ outTradeNo: res.out_trade_no, isPolling: true });

      const oldContainer = document.getElementById('sciencex-landing-alipay-form');
      if (oldContainer) oldContainer.remove();

      const formContainer = document.createElement('div');
      formContainer.id = 'sciencex-landing-alipay-form';
      formContainer.style.display = 'none';
      formContainer.innerHTML = res.payment_html;
      document.body.appendChild(formContainer);

      const submitForm = formContainer.querySelector('form');
      if (submitForm) {
        submitForm.target = '_blank';
        submitForm.submit();
      }
    } catch (err: any) {
      toast(err?.message || '创建支付宝支付订单失败', 'err');
    } finally {
      setPayLoading(false);
    }
  };

  /* 轮询支付状态 */
  useEffect(() => {
    if (!payingState?.outTradeNo || !payingState?.isPolling) return;
    let count = 0;
    const maxPoll = 40;

    const timer = setInterval(async () => {
      count += 1;
      if (count > maxPoll) {
        clearInterval(timer);
        setPayingState((s) => (s ? { ...s, isPolling: false } : null));
        return;
      }
      try {
        const queryRes = await api<any>(`/payment/alipay/query?out_trade_no=${encodeURIComponent(payingState.outTradeNo)}`);
        if (queryRes && (queryRes.trade_status === 'TRADE_SUCCESS' || queryRes.trade_status === 'TRADE_FINISHED')) {
          clearInterval(timer);
          toast('🎉 支付宝支付成功，已为您开通套餐！');
          setPayingState(null);
          setCheckoutPlan(null);
          await refresh();
          nav('/account?tab=billing');
        }
      } catch {
        // 静默重试
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [payingState?.outTradeNo, payingState?.isPolling, nav, refresh, toast]);

  const manualCheckPayment = async () => {
    if (!payingState?.outTradeNo) return;
    try {
      const queryRes = await api<any>(`/payment/alipay/query?out_trade_no=${encodeURIComponent(payingState.outTradeNo)}`);
      if (queryRes && (queryRes.trade_status === 'TRADE_SUCCESS' || queryRes.trade_status === 'TRADE_FINISHED')) {
        toast('🎉 支付宝支付成功，已为您开通套餐！');
        setPayingState(null);
        setCheckoutPlan(null);
        await refresh();
        nav('/account?tab=billing');
      } else {
        toast('暂未核销到支付结果，若已付款请稍等片刻后再次点击', 'info');
      }
    } catch (e: any) {
      toast(e?.message || '查询支付状态失败', 'err');
    }
  };

  return (
    <section id="pricing" className="landing-section pricing-section">
      <div className="section-head">
        <div className="section-badge">Flexible Pricing</div>
        <h2 className="section-title">透明亲民的科研支持方案</h2>
        <p className="section-sub">从一个人的灵感，到整个团队的突破。<br />选择适合你现阶段的科研搭档。</p>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan) => (
          <article className={`pricing-card${plan.id === 'pro' ? ' popular' : ''}`} key={plan.id}>
            <div className="pricing-card-top">
              <span className="pricing-icon"><Icon name={plan.icon as any} size={21} /></span>
              <span className="pricing-tier">{plan.english}</span>
              {plan.id === 'pro' && <span className="pricing-popular-tag"><Icon name="star" size={11} />推荐方案</span>}
            </div>
            <h3>{plan.name}</h3>
            <p className="pricing-description">{plan.description}</p>
            <div className={`pricing-price${plan.id === 'enterprise' ? ' custom' : ''}`}>
              {plan.id !== 'enterprise' && <span className="pricing-currency">¥</span>}
              {plan.price}
            </div>
            <div className="pricing-period">{plan.period}</div>
            <button className="pricing-action" onClick={() => handleAction(plan)}>
              {plan.action}<Icon name="arrowRight" size={16} />
            </button>
            <div className="pricing-audience">{plan.audience}</div>
            <div className="pricing-features">
              <p>{plan.summary}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={14} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>

      <div className="pricing-assurance">
        <span><Icon name="shield" size={15} />数据私有可控</span>
        <span><Icon name="link" size={15} />支持自定义模型</span>
        <span><Icon name="users" size={15} />覆盖个人与团队</span>
      </div>

      {/* ===== 首页快捷支付宝收银台弹窗 ===== */}
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
              <span className="kv-v">按{checkoutPlan.period?.replace('/', '')?.trim() || '月'}开通 · 随时可退</span>
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
              点击后将在新标签页中打开支付宝官方安全收银台完成付款。付款完成后系统将自动同步权益。
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
    </section>
  );
};
