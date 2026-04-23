import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "NextAPI Docs",
  tagline: "Video generation API for production teams",
  favicon: "img/favicon.ico",

  url: "https://docs.nextapi.top",
  baseUrl: "/",

  organizationName: "nextapi",
  projectName: "nextapi-docs",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en", "zh"],
    localeConfigs: {
      en: { label: "English", direction: "ltr", htmlLang: "en-US" },
      zh: { label: "中文", direction: "ltr", htmlLang: "zh-CN" },
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          editUrl: "https://github.com/nextapi/docs/edit/main/docs-site/",
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/og-nextapi.png",

    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    // Algolia search — configure with your own credentials when ready
    // algolia: {
    //   appId: "YOUR_APP_ID",
    //   apiKey: "YOUR_SEARCH_API_KEY",
    //   indexName: "nextapi_docs",
    //   contextualSearch: true,
    // },

    navbar: {
      title: "NextAPI",
      logo: {
        alt: "NextAPI Logo",
        src: "img/logo.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "mainSidebar",
          position: "left",
          label: "Docs",
        },
        {
          to: "/api-reference",
          label: "API Reference",
          position: "left",
        },
        {
          href: "https://app.nextapi.top",
          label: "Dashboard",
          position: "right",
        },
        {
          type: "localeDropdown",
          position: "right",
        },
      ],
      hideOnScroll: false,
    },

    footer: {
      style: "dark",
      links: [
        {
          title: "Get Started",
          items: [
            { label: "Non-developers", to: "/non-coder-guide" },
            { label: "Quick Start", to: "/quickstart" },
            { label: "Batch Guide", to: "/batch-guide" },
            { label: "API Reference", to: "/api-reference" },
          ],
        },
        {
          title: "Workflows",
          items: [
            { label: "Character Consistency", to: "/consistency-guide" },
            { label: "Short Drama Workflow", to: "/short-drama-workflow" },
            { label: "ComfyUI Guide", to: "/comfyui-guide" },
          ],
        },
        {
          title: "Support",
          items: [
            { label: "Errors & Troubleshooting", to: "/errors" },
            { label: "FAQ", to: "/faq" },
            { label: "Dashboard", href: "https://app.nextapi.top" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} NextAPI. All rights reserved.`,
    },

    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ["bash", "python", "json", "typescript", "http"],
    },

    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
