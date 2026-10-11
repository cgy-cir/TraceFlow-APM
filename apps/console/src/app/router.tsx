import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { ApplicationEntryPage } from '../pages/ApplicationEntryPage'
import { IssuesPage } from '../pages/IssuesPage'
import { IssueDetailPage } from '../pages/IssueDetailPage'
import { NetworkPage } from '../pages/NetworkPage'
import { OverviewPage } from '../pages/OverviewPage'
import { PerformancePage } from '../pages/PerformancePage'
import { SettingsPage } from '../pages/SettingsPage'
import { LoginPage } from '../pages/LoginPage'
import { UsersPage } from '../pages/UsersPage'
import { AuthGate } from './AuthGate'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AuthGate />,
    children: [
      { path: '/', element: <ApplicationEntryPage /> },
      {
        path: '/apps/:appId',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <OverviewPage /> },
          { path: 'issues', element: <IssuesPage /> },
          { path: 'issues/:issueId', element: <IssueDetailPage /> },
          { path: 'network', element: <NetworkPage /> },
          { path: 'performance', element: <PerformancePage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      {
        path: '/users',
        element: <AppLayout />,
        children: [{ index: true, element: <UsersPage /> }],
      },
    ],
  },
])
