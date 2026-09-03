import React from "react";
import { Box, Text, useApp } from "ink";
import {
  OpenAICompatibleProvider,
  PRESETS,
  loadConfig,
  normalizeBaseUrl,
  providerId,
  saveConfig,
  setSecret,
  type ProviderProfile,
} from "@magnetar/core";
import { Picker } from "./components/Picker.js";
import { TextInput } from "./components/TextInput.js";
import { theme } from "./theme.js";

type Step =
  | { kind: "preset" }
  | { kind: "name" }
  | { kind: "url" }
  | { kind: "key" }
  | { kind: "loading" }
  | { kind: "model"; models: string[] }
  | { kind: "done"; text: string }
  | { kind: "failed"; text: string };

/** Adding a provider runs inside the same Ink app as everything else. The
 *  prototype dropped to inquirer in a separate process and told the user to
 *  restart, because blessed and inquirer fought over the keyboard. */
export function ProviderWizard(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = React.useState<Step>({ kind: "preset" });
  const [draft, setDraft] = React.useState("");
  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [keyless, setKeyless] = React.useState(false);

  const fetchModels = React.useCallback(async (url: string, key: string) => {
    setStep({ kind: "loading" });
    const provider = new OpenAICompatibleProvider({ baseUrl: url, apiKey: key || null });
    try {
      const models = await provider.listModels();
      if (models.length === 0) {
        setStep({ kind: "failed", text: "The endpoint answered but listed no models." });
        return;
      }
      setStep({ kind: "model", models });
    } catch (error) {
      setStep({ kind: "failed", text: (error as Error).message });
    }
  }, []);

  const save = React.useCallback(
    async (model: string, models: string[]) => {
      const config = await loadConfig();
      const profile: ProviderProfile = {
        id: providerId(
          name,
          config.providers.map((p) => p.id),
        ),
        name,
        baseUrl,
        model,
        models,
        ...(keyless ? { keyless: true } : {}),
      };
      config.providers = [...config.providers.filter((p) => p.name !== name), profile];
      config.activeProviderId = profile.id;
      await saveConfig(config);

      let where = "";
      if (apiKey) {
        const backend = await setSecret(profile.id, apiKey);
        where =
          backend === "keychain"
            ? "Key stored in the system keychain."
            : "No keychain available — key stored in ~/.magnetar/secrets.json (owner-only).";
      }
      setStep({ kind: "done", text: `${name} · ${model}\n${where}\n\nRun \`magnetar\` to start.` });
      setTimeout(exit, 10);
    },
    [apiKey, baseUrl, exit, keyless, name],
  );

  switch (step.kind) {
    case "preset":
      return (
        <Picker
          title="Provider"
          height={PRESETS.length + 1}
          items={[
            ...PRESETS.map((preset) => ({
              value: preset.name,
              label: preset.name,
              hint: preset.baseUrl,
            })),
            { value: "__custom", label: "Custom endpoint…", hint: "any OpenAI-compatible URL" },
          ]}
          onCancel={exit}
          onSelect={(value) => {
            if (value === "__custom") {
              setDraft("");
              return setStep({ kind: "name" });
            }
            const preset = PRESETS.find((p) => p.name === value)!;
            setName(preset.name);
            setBaseUrl(preset.baseUrl);
            setKeyless(preset.keyless ?? false);
            setDraft("");
            if (preset.keyless) void fetchModels(preset.baseUrl, "");
            else setStep({ kind: "key" });
          }}
        />
      );

    case "name":
      return (
        <Prompt
          label="Name"
          value={draft}
          onChange={setDraft}
          onSubmit={(value) => {
            if (!value.trim()) return;
            setName(value.trim());
            setDraft("");
            setStep({ kind: "url" });
          }}
        />
      );

    case "url":
      return (
        <Prompt
          label="Base URL"
          hint="e.g. https://api.example.com/v1"
          value={draft}
          onChange={setDraft}
          onSubmit={(value) => {
            const url = normalizeBaseUrl(value);
            if (!url) return;
            setBaseUrl(url);
            setDraft("");
            setStep({ kind: "key" });
          }}
        />
      );

    case "key":
      return (
        <Prompt
          label={`API key for ${name}`}
          hint="stored in your system keychain, never in the config file"
          mask="•"
          value={draft}
          onChange={setDraft}
          onSubmit={(value) => {
            setApiKey(value.trim());
            setDraft("");
            void fetchModels(baseUrl, value.trim());
          }}
        />
      );

    case "loading":
      return <Text color={theme.dim}>Asking {baseUrl} which models it has…</Text>;

    case "model":
      return (
        <Picker
          title="Model"
          items={step.models.map((value) => ({ value, label: value }))}
          onCancel={exit}
          onSelect={(value) => void save(value, step.models)}
        />
      );

    case "failed":
      return (
        <Box flexDirection="column">
          <Text color={theme.err}>Could not reach the provider.</Text>
          <Text color={theme.dim}>{step.text}</Text>
          <Text color={theme.dim}>Run `magnetar provider` again to retry.</Text>
        </Box>
      );

    case "done":
      return (
        <Box flexDirection="column">
          <Text color={theme.ok}>Saved.</Text>
          <Text>{step.text}</Text>
        </Box>
      );
  }
}

function Prompt({
  label,
  hint,
  value,
  onChange,
  onSubmit,
  mask,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  mask?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>{label}</Text>
      {hint ? <Text color={theme.dim}>{hint}</Text> : null}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent}>{"› "}</Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} history={[]} mask={mask} />
      </Box>
    </Box>
  );
}
