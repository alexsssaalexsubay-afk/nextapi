import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/zh/',
    component: ComponentCreator('/zh/', 'a79'),
    exact: true
  },
  {
    path: '/zh/',
    component: ComponentCreator('/zh/', '6e8'),
    routes: [
      {
        path: '/zh/',
        component: ComponentCreator('/zh/', '7ab'),
        routes: [
          {
            path: '/zh/',
            component: ComponentCreator('/zh/', 'cb5'),
            routes: [
              {
                path: '/zh/api-key-guide',
                component: ComponentCreator('/zh/api-key-guide', '343'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/api-reference',
                component: ComponentCreator('/zh/api-reference', 'b85'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/batch-guide',
                component: ComponentCreator('/zh/batch-guide', 'b06'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/comfyui-guide',
                component: ComponentCreator('/zh/comfyui-guide', 'c61'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/consistency-guide',
                component: ComponentCreator('/zh/consistency-guide', '318'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/errors',
                component: ComponentCreator('/zh/errors', '7f9'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/faq',
                component: ComponentCreator('/zh/faq', '0c2'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/non-coder-guide',
                component: ComponentCreator('/zh/non-coder-guide', '650'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/quickstart',
                component: ComponentCreator('/zh/quickstart', '996'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/short-drama-workflow',
                component: ComponentCreator('/zh/short-drama-workflow', 'bfd'),
                exact: true,
                sidebar: "mainSidebar"
              },
              {
                path: '/zh/',
                component: ComponentCreator('/zh/', '734'),
                exact: true,
                sidebar: "mainSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
