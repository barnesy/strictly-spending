import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PageTransition } from './components/PageTransition';
import { Suspense } from 'react';
import PageLoader from './components/PageLoader';
import { lazyWithRetry } from './utils/lazyWithRetry';

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Budget = lazyWithRetry(() => import('./pages/Budget'));
const Forecast = lazyWithRetry(() => import('./pages/Forecast'));
const Import = lazyWithRetry(() => import('./pages/Import'));
const Rules = lazyWithRetry(() => import('./pages/Rules'));
const Categories = lazyWithRetry(() => import('./pages/Categories'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const ThemeManager = lazyWithRetry(() => import('./pages/ThemeManager'));
const Sort = lazyWithRetry(() => import('./pages/Sort'));
const Merchants = lazyWithRetry(() => import('./pages/Merchants'));
const Loans = lazyWithRetry(() => import('./pages/Loans'));
const PrivacyPolicy = lazyWithRetry(() => import('./pages/PrivacyPolicy'));

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

