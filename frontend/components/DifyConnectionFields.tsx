export default function DifyConnectionFields({
  apiBaseUrl,
  apiKeyConfigured,
}: {
  apiBaseUrl: string;
  apiKeyConfigured: boolean;
}) {
  return (
    <>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Dify API 地址
        <input
          name="dify_api_base_url"
          type="url"
          required
          maxLength={2048}
          defaultValue={apiBaseUrl}
          placeholder="https://api.dify.ai/v1"
          autoComplete="off"
          spellCheck={false}
          className="form-field mt-1.5"
        />
        <span className="mt-1.5 block text-xs font-normal text-slate-500">填写应用的 Service API 地址，包含 /v1。</span>
      </label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Dify API Key
        <input
          name="dify_api_key"
          type="password"
          maxLength={8192}
          placeholder={apiKeyConfigured ? "已配置，留空保留当前密钥" : "填写此 Dify 应用的 API Key"}
          autoComplete="new-password"
          autoCapitalize="off"
          spellCheck={false}
          className="form-field mt-1.5"
        />
        <span className="mt-1.5 block text-xs font-normal text-slate-500">
          {apiKeyConfigured ? "密钥已保存，只有填写新密钥才会替换。" : "尚未配置密钥。"}保存后不明文显示。
        </span>
      </label>
    </>
  );
}
