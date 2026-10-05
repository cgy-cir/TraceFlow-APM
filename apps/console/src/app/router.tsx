import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { ApplicationEntryPage } from '../pages/ApplicationEntryPage'
import { IssuesPage } from '../pages/IssuesPage'
import { IssueDetailPage } from '../pages/IssueDetailPage'
import { NetworkPage } from '../pages/NetworkPage'
import { OverviewPage } from '../pages/OverviewPage'
import { SettingsPage } from '../pages/SettingsPage'

export const router = createBrowserRouter([
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
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
