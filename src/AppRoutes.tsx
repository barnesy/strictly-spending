import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PageTransition } from './components/PageTransition';
import React, { Suspense } from 'react';
import PageLoader from './components/PageLoader';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Budget = React.lazy(() => import('./pages/Budget'));
const Import = React.lazy(() => import('./pages/Import'));
const Rules = React.lazy(() => import('./pages/Rules'));
const Categories = React.lazy(() => import('./pages/Categories'));
const Settings = React.lazy(() => import('./pages/Settings'));
const ThemeManager = React.lazy(() => import('./pages/ThemeManager'));
const LocalModel = React.lazy(() => import('./pages/LocalModel'));
const Sort = React.lazy(() => import('./pages/Sort'));
const AnimationSettings = React.lazy(() => import('./pages/AnimationSettings'));
const Merchants = React.lazy(() => import('./pages/Merchants'));
const Taxes = React.lazy(() => import('./pages/Taxes'));
const Loans = React.lazy(() => import('./pages/Loans'));
const ToolsReference = React.lazy(() => import('./pages/ToolsReference'));
const ApiPlayground = React.lazy(() => import('./pages/ApiPlayground'));
const Artifacts = React.lazy(() => import('./pages/Artifacts'));
const ArtifactDetail = React.lazy(() => import('./pages/ArtifactDetail'));

export function AppRoutes() {
  const location = useLocation();
  const transitionKey = location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/transactions' ? 'dashboard' : location.pathname;

  return (
    <PageTransition transitionKey={transitionKey}>
      <Suspense fallback={<PageLoader isLoading={true}><div /></PageLoader>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sort" element={<Sort />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/transactions" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/theme" element={<ThemeManager />} />
          <Route path="/local-model" element={<LocalModel />} />
          <Route path="/ai-reference" element={<ToolsReference />} />
          <Route path="/api-playground" element={<ApiPlayground />} />
          <Route path="/animation-playground" element={<AnimationSettings />} />
          <Route path="/merchants" element={<Merchants />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/artifacts" element={<Artifacts />} />
          <Route path="/artifacts/:id" element={<ArtifactDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PageTransition>
  );
}
