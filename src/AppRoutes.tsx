import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PageTransition } from './components/PageTransition';

import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import Import from './pages/Import';
import Rules from './pages/Rules';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import ThemeManager from './pages/ThemeManager';
import LocalModel from './pages/LocalModel';
import { AgentSkills } from './pages/AgentSkills';
import Sort from './pages/Sort';
import AnimationSettings from './pages/AnimationSettings';
import Merchants from './pages/Merchants';
import Taxes from './pages/Taxes';
import Loans from './pages/Loans';
import Documents from './pages/Documents';
import ToolsReference from './pages/ToolsReference';

export function AppRoutes() {
  const location = useLocation();
  const transitionKey = location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/transactions' ? 'dashboard' : location.pathname;

  return (
    <PageTransition transitionKey={transitionKey}>
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
        <Route path="/agent-skills" element={<AgentSkills />} />
        <Route path="/ai-reference" element={<ToolsReference />} />
        <Route path="/animation-playground" element={<AnimationSettings />} />
        <Route path="/merchants" element={<Merchants />} />
        <Route path="/taxes" element={<Taxes />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PageTransition>
  );
}
