import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PageTransition } from './components/PageTransition';
import React, { Suspense } from 'react';
import PageLoader from './components/PageLoader';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Budget = React.lazy(() => import('./pages/Budget'));
const Forecast = React.lazy(() => import('./pages/Forecast'));
const Import = React.lazy(() => import('./pages/Import'));
const Rules = React.lazy(() => import('./pages/Rules'));
const Categories = React.lazy(() => import('./pages/Categories'));
const Settings = React.lazy(() => import('./pages/Settings'));
const ThemeManager = React.lazy(() => import('./pages/ThemeManager'));
const Sort = React.lazy(() => import('./pages/Sort'));
const Merchants = React.lazy(() => import('./pages/Merchants'));
const Loans = React.lazy(() => import('./pages/Loans'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));

export function AppRoutes() {
  const location = useLocation();
  const transitionKey = location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/transactions' || location.pathname === '/timeline' ? 'dashboard' : location.pathname;

  return (
    <PageTransition transitionKey={transitionKey}>
      <Suspense fallback={<PageLoader isLoading={true}><div /></PageLoader>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sort" element={<Sort />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/budgets" element={<Navigate to="/budget" replace />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/transactions" element={<Dashboard />} />
          <Route path="/timeline" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/theme" element={<ThemeManager />} />
          <Route path="/merchants" element={<Merchants />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PageTransition>
  );
}

