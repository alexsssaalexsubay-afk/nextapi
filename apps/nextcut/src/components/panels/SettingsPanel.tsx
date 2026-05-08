import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { capabilityMeta } from "@/lib/capability-badges";
import { sidecarFetch } from "@/lib/sidecar";
import { useAuthStore } from "@/stores/auth-store";
import { type AgentLLMConfig, type PipelineConfig, useDirectorStore } from "@/stores/director-store";
import {
  Button,
  FieldLabel,
  FieldShell,
  PageHeader,
  PageShell,
  Pill,
  SectionCard,
  Segmented,
  SelectField,
  StatusBadge,
  Surface,
} from "@/components/ui/kit";

const LLM_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "minimax", label: "MiniMax" },
  { id: "qwen", label: "Qwen" },
  { id: "ollama", label: "Ollama Local" },
  { id: "custom", label: "自定义" },
];

const VIDEO_MODELS = [
  { id: "seedance-2.0-pro", label: "Seedance 2.0 Pro" },
  { id: "seedance-2.0-fast", label: "Seedance 2.0 Fast" },
  { id: "seedance-1.5-pro", label: "Seedance 1.5 Pro" },
];

const AGENTS: Array<{ key: keyof Pick<PipelineConfig, "screenwriter" | "character_extractor" | "storyboard_artist" | "cinematographer" | "audio_director" | "editing_agent" | "consistency_checker" | "prompt_optimizer">; label: string; role: string }> = [
  { key: "screenwriter", label: "Alex", role: "编剧 / 需求理解" },
  { key: "character_extractor", label: "Maya", role: "角色与一致性" },
  { key: "storyboard_artist", label: "Jin", role: "分镜设计" },
  { key: "cinematographer", label: "Leo", role: "摄影语言" },
  { key: "audio_director", label: "Aria", role: "音乐与声音" },
  { key: "editing_agent", label: "Sam", role: "剪辑与节奏" },
  { key: "consistency_checker", label: "Mira", role: "质量巡检" },
  { key: "prompt_optimizer", label: "Nova", role: "提示词优化" },
];

type Tab = "llm" | "models" | "video" | "agents" | "prompts" | "team";

type ModelPreset = {
  id: string;
  provider: string;
  label: string;
  model: string;
  base_url: string;
  api_kind: string;
  category: string;
  notes?: string;
};

type RuntimePrompt = {
  id: string;
  label: string;
  role: string;
  prompt: string;
  default_prompt: string;
  is_custom: boolean;
};

type TeamUsage = {
  org?: { id: string; name: string };
  viewer?: { user_id: string; email: string; role: string; can_manage: boolean };
  members: Array<{
    user_id: string;
    email: string;
    role: string;
    created_at: string;
    jobs_count: number;
    credits_used: number;
    last_used_at?: string | null;
  }>;
  shared_usage?: { jobs_count: number; credits_used: number };
};

function formatCents(value?: number) {
  const cents = Number(value || 0);
  return `$ ${(cents / 100).toFixed(2)}`;
}

export function SettingsPanel() {
  const { pipeline, setPipeline, setDefaultLLM } = useDirectorStore();
  const { user, status } = useAuthStore();
  const llm = pipeline.default_llm;
  const [activeTab, setActiveTab] = useState<Tab>("llm");
  const [modelPresets, setModelPresets] = useState<ModelPreset[]>([]);
  const [runtimePrompts, setRuntimePrompts] = useState<RuntimePrompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState("screenwriter");
  const [promptDraft, setPromptDraft] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [teamUsage, setTeamUsage] = useState<TeamUsage | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "warning"; text: string }>({
    tone: "info",
    text: "设置会自动保存在本地浏览器存储中。",
  });

  const configuredAgents = useMemo(() => AGENTS.filter((agent) => Boolean(pipeline[agent.key])).length, [pipeline]);
  const filteredPresets = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return modelPresets;
    return modelPresets.filter((preset) => (
      preset.label.toLowerCase().includes(q) ||
      preset.provider.toLowerCase().includes(q) ||
      preset.model.toLowerCase().includes(q) ||
      preset.base_url.toLowerCase().includes(q)
    ));
  }, [modelPresets, modelQuery]);
  const selectedPrompt = runtimePrompts.find((item) => item.id === selectedPromptId) || runtimePrompts[0] || null;

  useEffect(() => {
    void sidecarFetch<{ presets: ModelPreset[] }>("/config/llm-presets")
      .then((res) => setModelPresets(res.presets || []))
      .catch(() => setNotice({ tone: "warning", text: "模型预设暂时无法从 sidecar 读取。" }));
    void sidecarFetch<{ prompts: RuntimePrompt[] }>("/config/prompts")
      .then((res) => {
        const prompts = res.prompts || [];
        setRuntimePrompts(prompts);
        const first = prompts[0];
        if (first) {
          setSelectedPromptId(first.id);
          setPromptDraft(first.prompt);
        }
      })
      .catch(() => setNotice({ tone: "warning", text: "提示词配置暂时无法从 sidecar 读取。" }));
  }, []);

  useEffect(() => {
    if (selectedPrompt) setPromptDraft(selectedPrompt.prompt);
  }, [selectedPrompt]);

  const refreshTeamUsage = async () => {
    if (!user?.sessionToken) return;
    const res = await sidecarFetch<TeamUsage>("/auth/team", {
      headers: { "X-NextAPI-Session": user.sessionToken },
    });
    setTeamUsage({ ...res, members: res.members || [] });
  };

  useEffect(() => {
    if (activeTab !== "team" || !user?.sessionToken) return;
    void refreshTeamUsage()
      .catch(() => setNotice({ tone: "warning", text: "团队用量暂时无法读取，请确认已登录团队账号。" }));
  }, [activeTab, user?.sessionToken]);

  const addTeamMember = async () => {
    if (!user?.sessionToken || !inviteEmail.trim()) return;
    await sidecarFetch<{ ok: boolean }>("/auth/team/members", {
      method: "POST",
      headers: { "X-NextAPI-Session": user.sessionToken },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    setInviteEmail("");
    setNotice({ tone: "success", text: "团队成员已添加，TA 可用邮箱验证码登录并共享团队余额。" });
    await refreshTeamUsage();
  };

  const updateTeamMemberRole = async (userId: string, role: string) => {
    if (!user?.sessionToken) return;
    await sidecarFetch<{ ok: boolean }>(`/auth/team/members/${userId}`, {
      method: "PATCH",
      headers: { "X-NextAPI-Session": user.sessionToken },
      body: JSON.stringify({ role }),
    });
    setNotice({ tone: "success", text: "成员角色已更新。" });
    await refreshTeamUsage();
  };

  const removeTeamMember = async (userId: string) => {
    if (!user?.sessionToken) return;
    await sidecarFetch<{ ok: boolean }>(`/auth/team/members/${userId}`, {
      method: "DELETE",
      headers: { "X-NextAPI-Session": user.sessionToken },
    });
    setNotice({ tone: "success", text: "成员已移出团队。" });
    await refreshTeamUsage();
  };

  const markSaved = () => {
    setNotice({ tone: "success", text: "配置已保存到本地。后续生成任务会读取当前设置。" });
  };

  const testConnection = async () => {
    try {
      const res = await sidecarFetch<{ status: string; message: string }>("/config/test-llm", {
        method: "POST",
        body: JSON.stringify({
          provider: llm.provider,
          model: llm.model,
          base_url: llm.base_url,
          api_key: llm.api_key,
        }),
      });
      setNotice({ tone: res.status === "configured" ? "success" : "warning", text: res.message });
    } catch {
      setNotice({ tone: "warning", text: "sidecar 配置检测失败，请确认后端服务已启动。" });
    }
  };

  const applyModelPreset = (preset: ModelPreset) => {
    setDefaultLLM({
      provider: preset.provider,
      model: preset.model,
      base_url: preset.base_url,
    });
    setNotice({ tone: "success", text: `已套用 ${preset.label}。API Key 仍需你按供应商填写。` });
  };

  const saveRuntimePrompt = async () => {
    if (!selectedPrompt) return;
    const res = await sidecarFetch<{ prompt: RuntimePrompt }>(`/config/prompts/${selectedPrompt.id}`, {
      method: "PUT",
      body: JSON.stringify({ prompt: promptDraft }),
    });
    setRuntimePrompts((current) => current.map((item) => item.id === res.prompt.id ? res.prompt : item));
    setNotice({ tone: "success", text: `${res.prompt.label} 的系统提示词已保存，后续 Agent 调用会使用新版。` });
  };

  const resetRuntimePrompt = async () => {
    if (!selectedPrompt) return;
    const res = await sidecarFetch<{ prompt: RuntimePrompt }>(`/config/prompts/${selectedPrompt.id}/reset`, {
      method: "POST",
    });
    setRuntimePrompts((current) => current.map((item) => item.id === res.prompt.id ? res.prompt : item));
    setPromptDraft(res.prompt.prompt);
    setNotice({ tone: "success", text: `${res.prompt.label} 已恢复默认提示词。` });
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="设置"
        subtitle="连接语言模型、视频生成服务和 AI Team，让后续创作任务使用同一套可控配置。"
        action={<Pill tone={notice.tone}>{notice.text}</Pill>}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Segmented<Tab>
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "llm", label: "语言模型" },
            { value: "models", label: "模型库" },
            { value: "video", label: "视频生成" },
            { value: "agents", label: "AI Team" },
            { value: "prompts", label: "提示词" },
            { value: "team", label: "团队与扣点" },
          ]}
        />
        <div className="flex items-center gap-2">
          <StatusBadge tone="info" title={capabilityMeta.text.hint}>文字 LLM</StatusBadge>
          <StatusBadge tone="warning" title={capabilityMeta.image.hint}>图片 / 垫图</StatusBadge>
          <StatusBadge tone="accent" title={capabilityMeta.video.hint}>视频生成</StatusBadge>
          <StatusBadge tone="accent">{llm.provider || "未选择"} / {llm.model || "未填写模型"}</StatusBadge>
          <StatusBadge tone={pipeline.generate_audio ? "success" : "neutral"}>{pipeline.generate_audio ? "生成音频" : "仅视频"}</StatusBadge>
        </div>
      </div>

      {activeTab === "team" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="团队账号与扣点"
            subtitle="团队管理员可以查看成员生成用量；普通成员只显示自己的用量。NextAPI 托管生成扣团队余额，本地或自带 Key 不扣团队点数。"
            action={<StatusBadge tone={teamUsage?.viewer?.can_manage ? "accent" : "neutral"}>{teamUsage?.viewer?.role || "未登录"}</StatusBadge>}
          >
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <Surface className="p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-nc-text-tertiary">团队</div>
                <div className="mt-2 line-clamp-1 text-[18px] font-semibold leading-7 text-nc-text">{teamUsage?.org?.name || user?.orgName || "未连接"}</div>
              </Surface>
              <Surface className="p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-nc-text-tertiary">余额</div>
                <div className="mt-2 text-[18px] font-semibold leading-7 text-nc-text">{formatCents(status?.credits)}</div>
              </Surface>
              <Surface className="p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-nc-text-tertiary">当前扣费源</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={pipeline.video_provider === "nextapi" ? "accent" : "warning"}>{pipeline.video_provider}</StatusBadge>
                  <StatusBadge tone={pipeline.video_provider === "nextapi" ? "success" : "neutral"}>
                    {pipeline.video_provider === "nextapi" ? "扣团队点数" : "外部 / 本地自费"}
                  </StatusBadge>
                </div>
              </Surface>
            </div>

            <div className="grid gap-3">
              {teamUsage?.viewer?.can_manage && (
                <Surface className="p-4">
                  <div className="mb-3 text-[14px] font-semibold leading-6 text-nc-text">添加成员</div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <FieldShell>
                      <input
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="member@example.com"
                        className="w-full bg-transparent text-[14px] leading-6 text-nc-text outline-none placeholder:text-nc-text-tertiary"
                      />
                    </FieldShell>
                    <SelectField
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </SelectField>
                    <Button variant="primary" onClick={addTeamMember} disabled={!inviteEmail.trim()}>
                      添加
                    </Button>
                  </div>
                </Surface>
              )}
              {(teamUsage?.members || []).map((member) => (
                <Surface key={member.user_id} interactive className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-[15px] font-semibold leading-6 text-nc-text">{member.email}</div>
                      <div className="mt-1 text-[12px] leading-5 text-nc-text-secondary">{member.user_id}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={member.role === "owner" || member.role === "admin" ? "accent" : "neutral"}>{member.role}</StatusBadge>
                      <StatusBadge tone="info">{member.jobs_count} 个任务</StatusBadge>
                      <StatusBadge tone="warning">已用 {formatCents(member.credits_used)}</StatusBadge>
                      {teamUsage?.viewer?.role === "owner" && member.role !== "owner" && (
                        <Button variant="secondary" onClick={() => updateTeamMemberRole(member.user_id, member.role === "admin" ? "member" : "admin")}>
                          {member.role === "admin" ? "降为 member" : "设为 admin"}
                        </Button>
                      )}
                      {teamUsage?.viewer?.can_manage && member.role !== "owner" && member.user_id !== teamUsage.viewer.user_id && (
                        <Button variant="danger" onClick={() => removeTeamMember(member.user_id)}>
                          移除
                        </Button>
                      )}
                    </div>
                  </div>
                </Surface>
              ))}
              {!teamUsage?.members?.length && (
                <Surface className="p-5 text-[14px] leading-6 text-nc-text-secondary">
                  登录团队账号后，这里会显示成员列表、角色和按成员归因的生成用量。
                </Surface>
              )}
            </div>
          </SectionCard>

          <GuidancePanel
            title="管理规则"
            items={[
              "owner/admin 可以查看全团队成员用量，member 只看自己的用量。",
              "新客户端登录会生成成员专属 dashboard key，避免多人互相挤掉 key，并支持按成员归因。",
              `历史共享 key 用量：${teamUsage?.shared_usage?.jobs_count || 0} 个任务，${formatCents(teamUsage?.shared_usage?.credits_used)}。这部分无法精确归因到个人。`,
            ]}
          />
        </div>
      )}

      {activeTab === "llm" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="默认语言模型" subtitle="用于脚本、角色、分镜、提示词优化等 AI Director 工作。">
            <div className="mb-5 flex flex-wrap gap-2">
              <StatusBadge tone="info" title={capabilityMeta.text.hint}>文字 LLM</StatusBadge>
              <StatusBadge tone="neutral">不会直接生成图片或视频</StatusBadge>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <SelectInput label="服务商" value={llm.provider} onChange={(value) => setDefaultLLM({ provider: value })} options={LLM_PROVIDERS} />
              <TextInput label="模型" value={llm.model} onChange={(value) => setDefaultLLM({ model: value })} placeholder="gpt-4o / claude-3.5 / deepseek-chat" />
              <TextInput label="API Key" value={llm.api_key} onChange={(value) => setDefaultLLM({ api_key: value })} type="password" placeholder="sk-..." />
              <TextInput label="Base URL" value={llm.base_url} onChange={(value) => setDefaultLLM({ base_url: value })} placeholder="留空使用默认端点" />
              <TextInput label="Temperature" value={String(llm.temperature)} onChange={(value) => setDefaultLLM({ temperature: parseFloat(value) || 0.7 })} type="number" placeholder="0.7" />
            </div>
            <ActionRow onTest={testConnection} onSave={markSaved} />
          </SectionCard>

          <GuidancePanel
            title="配置建议"
            items={[
              "创意探索使用响应快的模型，最终分镜和提示词优化使用更稳定的模型。",
              "团队项目建议固定 Base URL，减少成员之间生成结果差异。",
              "API Key 仅保存在本地，不会写入代码仓库。",
            ]}
          />
        </div>
      )}

      {activeTab === "models" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="模型预设库"
            subtitle="预置 30+ 个主流 LLM / 聚合网关配置。点击即可写入默认语言模型；Key 仍由你本地填写。"
            action={<StatusBadge tone="accent">{modelPresets.length} 个预设</StatusBadge>}
          >
            <div className="mb-5">
              <FieldShell>
                <input
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder="搜索 OpenAI / Claude / Gemini / DeepSeek / Qwen / OpenRouter..."
                  className="w-full bg-transparent text-[14px] leading-6 text-nc-text outline-none placeholder:text-nc-text-tertiary"
                />
              </FieldShell>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {filteredPresets.map((preset) => (
                <Surface key={preset.id} interactive className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-[15px] font-semibold leading-6 text-nc-text">{preset.label}</div>
                      <div className="mt-1 line-clamp-1 font-mono text-[12px] leading-5 text-nc-text-secondary">{preset.model}</div>
                    </div>
                    <StatusBadge tone={preset.provider === "custom" ? "neutral" : "accent"}>{preset.provider}</StatusBadge>
                  </div>
                  <div className="mt-3 line-clamp-1 rounded-[12px] bg-nc-panel px-3 py-2 font-mono text-[11px] leading-5 text-nc-text-tertiary">
                    {preset.base_url}
                  </div>
                  {preset.notes && <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-nc-text-secondary">{preset.notes}</p>}
                  <Button className="mt-4 w-full" variant="secondary" onClick={() => applyModelPreset(preset)}>
                    套用到默认模型
                  </Button>
                </Surface>
              ))}
            </div>
          </SectionCard>

          <GuidancePanel
            title="模型库说明"
            items={[
              "非 OpenAI 原生协议的服务商保留 api_kind；当前主流程仍通过 OpenAI-compatible 客户端，custom 网关最稳。",
              "Anthropic / Gemini 直连需要适配层或兼容网关；预设先保留官方 endpoint 与模型名，方便后台继续接。",
              "模型名会经常更新，这里可继续扩展，不需要改业务页面。",
            ]}
          />
        </div>
      )}

      {activeTab === "video" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="视频生成服务"
            subtitle="控制 Seedance / NextAPI / ComfyUI / RunningHub / 本地兼容服务的生成参数，和文字 LLM 分开配置。"
            action={<StatusBadge tone="accent" title={capabilityMeta.video.hint}>视频生成</StatusBadge>}
          >
            <div className="mb-5 flex flex-wrap gap-2">
              <StatusBadge tone="accent">视频 Provider</StatusBadge>
              <StatusBadge tone="warning">可接收 image_urls 垫图</StatusBadge>
              <StatusBadge tone="success">可接收 audio_urls</StatusBadge>
              <StatusBadge tone="danger">生成前本地预检</StatusBadge>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <SelectInput label="视频模型" value={pipeline.video_model} onChange={(value) => setPipeline({ video_model: value })} options={VIDEO_MODELS} />
              <SelectInput
                label="输出质量"
                value={pipeline.video_quality}
                onChange={(value) => setPipeline({ video_quality: value })}
                options={[
                  { id: "480p", label: "480p 预览" },
                  { id: "720p", label: "720p 标准" },
                  { id: "1080p", label: "1080p 高清" },
                ]}
              />
              <TextInput label="API Key" value={pipeline.video_api_key} onChange={(value) => setPipeline({ video_api_key: value })} type="password" placeholder="sk_live_..." />
              <TextInput label="Base URL" value={pipeline.video_base_url} onChange={(value) => setPipeline({ video_base_url: value })} placeholder="https://api.nextapi.top/v1" />
            </div>

            <label className="mt-6 flex cursor-pointer items-center justify-between gap-5 rounded-[16px] border border-nc-border bg-nc-panel px-5 py-4">
              <span>
                <span className="block text-[14px] font-semibold leading-6 text-nc-text">生成中文音频 / 字幕</span>
                <span className="mt-1 block text-[13px] leading-5 text-nc-text-secondary">在工作流生成时同步准备音频线索，适合短视频草案。</span>
              </span>
              <input
                type="checkbox"
                checked={pipeline.generate_audio}
                onChange={(event) => setPipeline({ generate_audio: event.target.checked })}
                className="h-5 w-5 accent-[#6C4DFF]"
              />
            </label>

            <ActionRow onTest={testConnection} onSave={markSaved} />
          </SectionCard>

          <GuidancePanel
            title="接口说明"
            items={[
              "默认请求路径为 POST /v1/videos。",
              "授权头使用 Authorization: Bearer sk_live_...",
              "如果自定义网关已包含 /v1，Base URL 不需要重复拼接。",
            ]}
          />
        </div>
      )}

      {activeTab === "agents" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title="AI Director Team"
            subtitle="这些 Agent 都是文字 LLM 节点：负责规划、拆解、检查和编译参数，不直接跑生图或视频。"
            action={<StatusBadge tone={configuredAgents > 0 ? "accent" : "neutral"}>{configuredAgents} 个自定义</StatusBadge>}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {AGENTS.map((agent) => {
                const override = pipeline[agent.key] as AgentLLMConfig | null;
                const hasOverride = override !== null && typeof override === "object";
                return (
                  <Surface key={agent.key} interactive selected={hasOverride} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold leading-6 text-nc-text">{agent.label}</p>
                        <p className="mt-1 text-[13px] leading-5 text-nc-text-secondary">{agent.role}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge tone="info">文字 LLM</StatusBadge>
                        <StatusBadge tone={hasOverride ? "accent" : "neutral"}>{hasOverride ? "自定义" : "默认"}</StatusBadge>
                      </div>
                    </div>
                    <div className="mt-5 rounded-[14px] bg-nc-panel px-4 py-3 text-[13px] leading-5 text-nc-text-secondary">
                      {hasOverride ? `${override.provider} / ${override.model}` : `继承 ${llm.provider || "默认服务商"} / ${llm.model || "默认模型"}`}
                    </div>
                  </Surface>
                );
              })}
            </div>
          </SectionCard>

          <GuidancePanel
            title="团队策略"
            items={[
              "编剧、分镜和提示词优化最影响结果质量，适合优先配置强模型。",
              "质量巡检可使用稳定低温度配置，减少评审波动。",
              "覆盖配置后会在 Agent 卡片上显示自定义状态。",
            ]}
          />
        </div>
      )}

      {activeTab === "prompts" && (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <SectionCard title="当前 Agent 提示词" subtitle="这里显示 sidecar 当前实际注册的文字 LLM 系统提示词，不再是黑盒。">
            <div className="grid gap-3">
              {runtimePrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => setSelectedPromptId(prompt.id)}
                  className={cn(
                    "rounded-[16px] border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                    selectedPromptId === prompt.id ? "border-nc-accent bg-[#F5F3FF] ring-2 ring-nc-accent/10" : "border-nc-border bg-white"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-semibold leading-6 text-nc-text">{prompt.label}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge tone="info">文字 LLM</StatusBadge>
                      <StatusBadge tone={prompt.is_custom ? "accent" : "neutral"}>{prompt.is_custom ? "已改" : "默认"}</StatusBadge>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-nc-text-secondary">{prompt.role}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={selectedPrompt ? `${selectedPrompt.label} 系统提示词` : "系统提示词"}
            subtitle="修改后会写入 sidecar runtime prompt registry，并影响后续 Agent 调用。"
            action={selectedPrompt && <StatusBadge tone={selectedPrompt.is_custom ? "accent" : "neutral"}>{selectedPrompt.id}</StatusBadge>}
          >
            <textarea
              value={promptDraft}
              onChange={(event) => setPromptDraft(event.target.value)}
              spellCheck={false}
              className="min-h-[520px] w-full resize-y rounded-[16px] border border-nc-border bg-white px-5 py-4 font-mono text-[12px] leading-6 text-nc-text outline-none transition focus:border-nc-accent focus:ring-2 focus:ring-nc-accent/10"
            />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-nc-border pt-5">
              <div className="text-[13px] leading-5 text-nc-text-secondary">
                当前长度 {promptDraft.length.toLocaleString()} 字符。建议每次只改一个 Agent，便于回滚。
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={resetRuntimePrompt} disabled={!selectedPrompt}>
                  恢复默认
                </Button>
                <Button variant="primary" onClick={saveRuntimePrompt} disabled={!selectedPrompt || promptDraft.trim().length < 20}>
                  保存提示词
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </PageShell>
  );
}

function ActionRow({ onTest, onSave }: { onTest: () => void | Promise<void>; onSave: () => void }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-nc-border pt-5">
      <Button variant="secondary" onClick={onTest}>
        <BoltIcon />
        测试连接
      </Button>
      <Button variant="primary" onClick={onSave}>
        <CheckIcon />
        保存配置
      </Button>
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <FieldLabel label={label}>
      <FieldShell>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[14px] leading-6 text-nc-text outline-none placeholder:text-nc-text-tertiary"
        />
      </FieldShell>
    </FieldLabel>
  );
}

function SelectInput({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <FieldLabel label={label}>
      <SelectField value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </SelectField>
    </FieldLabel>
  );
}

function GuidancePanel({ title, items }: { title: string; items: string[] }) {
  return (
    <SectionCard title={title} subtitle="轻量提示，不抢主内容。" contentClassName="p-5">
      <div className="flex flex-col gap-3">
        {items.map((item, index) => (
          <div key={item} className="flex gap-3 rounded-[14px] bg-nc-panel px-4 py-3">
            <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", index === 0 ? "bg-nc-accent text-white" : "bg-white text-nc-text-secondary")}>{index + 1}</span>
            <p className="text-[13px] leading-5 text-nc-text-secondary">{item}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function BoltIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2 5 11h5l-1 7 6-9h-5l1-7Z" /></svg>;
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 10.5 4 4L16 6" /></svg>;
}
