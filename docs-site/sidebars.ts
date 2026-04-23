import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  mainSidebar: [
    {
      type: "doc",
      id: "index",
      label: "Overview",
    },
    {
      type: "doc",
      id: "non-coder-guide",
      label: "Non-developers",
    },
    {
      type: "doc",
      id: "quickstart",
      label: "Quick Start",
    },
    {
      type: "doc",
      id: "non-coder-guide",
      label: "Non-developers",
    },
    {
      type: "category",
      label: "Batch Generation",
      collapsed: false,
      items: [
        { type: "doc", id: "batch-guide", label: "Batch Guide" },
        { type: "doc", id: "consistency-guide", label: "Character Consistency" },
        { type: "doc", id: "short-drama-workflow", label: "Short Drama Workflow" },
      ],
    },
    {
      type: "category",
      label: "Integrations",
      collapsed: false,
      items: [
        { type: "doc", id: "comfyui-guide", label: "ComfyUI Guide" },
      ],
    },
    {
      type: "category",
      label: "API",
      collapsed: false,
      items: [
        { type: "doc", id: "api-key-guide", label: "API Keys" },
        { type: "doc", id: "api-reference", label: "API Reference" },
        { type: "doc", id: "webhooks", label: "Webhooks" },
      ],
    },
    {
      type: "category",
      label: "Platform Operations",
      collapsed: false,
      items: [
        { type: "doc", id: "operations", label: "Operations Guide" },
      ],
    },
    {
      type: "category",
      label: "Support",
      collapsed: false,
      items: [
        { type: "doc", id: "errors", label: "Errors & Troubleshooting" },
        { type: "doc", id: "faq", label: "FAQ" },
      ],
    },
  ],
};

export default sidebars;
