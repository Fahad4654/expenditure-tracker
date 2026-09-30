import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import { ROUTES } from './routes';

/**
 * Route table.
 *
 * Phase 3 adds `<ProtectedRoute>` wrappers around the app section and the auth
 * pages; the layout route below is where they will hang.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
