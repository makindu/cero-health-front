import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { Spinner } from '@/components/feedback/spinner';
import { AppLayout } from '@/components/layout/app-layout';
import { env } from '@/core/config/env';
import { NAV_ITEMS, type NavItem } from '@/core/navigation/nav-config';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ModuleRoute } from '@/modules/_shared/ModuleRoute';
import { MODULE_PAGES } from '@/modules/registry';

const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));
const ModulePlaceholderPage = lazy(() => import('@/pages/ModulePlaceholderPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const PatientDetailPage = lazy(() => import('@/modules/patients/PatientDetailPage'));
const LocalDataPage = lazy(() => import('@/modules/localData/LocalDataPage'));
const ConsultationWorkspace = lazy(() => import('@/modules/consultations/ConsultationWorkspace'));

const lazyElement = (element: React.ReactNode) => (
  <Suspense fallback={<Spinner className="p-6" />}>{element}</Suspense>
);

/** Page du module, protégée par sa permission (confort : l'API revérifie toujours). */
function moduleElement(item: NavItem) {
  const Page = MODULE_PAGES[item.id];
  return lazyElement(
    <ModuleRoute permission={item.permission}>
      {Page ? <Page /> : <ModulePlaceholderPage item={item} />}
    </ModuleRoute>,
  );
}

const dashboardItem = NAV_ITEMS.find((item) => item.path === '/');

const moduleRoutes: RouteObject[] = NAV_ITEMS.filter((item) => item.path !== '/').map((item) => ({
  path: item.path.slice(1),
  element: moduleElement(item),
}));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      ...(dashboardItem ? [{ index: true, element: moduleElement(dashboardItem) }] : []),
      ...moduleRoutes,
      {
        path: 'patients/:id',
        element: lazyElement(
          <ModuleRoute permission={PERMISSIONS.patients.view}>
            <PatientDetailPage />
          </ModuleRoute>,
        ),
      },
      {
        path: 'consultations/:id',
        element: lazyElement(
          <ModuleRoute permission={PERMISSIONS.consultations.view}>
            <ConsultationWorkspace />
          </ModuleRoute>,
        ),
      },
      ...(env.localMode
        ? [{ path: 'local-data', element: lazyElement(<LocalDataPage />) }]
        : []),
      ...(env.designSystemEnabled
        ? [{ path: 'design-system', element: lazyElement(<DesignSystemPage />) }]
        : []),
      { path: '*', element: lazyElement(<NotFoundPage />) },
    ],
  },
  { path: '/index.html', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
