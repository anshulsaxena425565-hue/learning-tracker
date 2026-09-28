import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useTeam } from './context/TeamContext'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import CourseOverview from './pages/CourseOverview'
import CoursePlayer from './pages/CoursePlayer'
import Teams from './pages/Teams'
import Leaderboard from './pages/Leaderboard'
import Profile from './pages/Profile'
import AddCourse from './pages/AddCourse'
import TestRunner from './pages/TestRunner'
import Admin from './pages/Placeholder'
import Chat from './pages/Chat'
import Credits from './pages/Credits'
import AppShell from './components/layout/AppShell'

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="splash">Learning<span>Beyond</span></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

function WorkspaceLayout() {
  return <RequireAuth><AppShell><Outlet /></AppShell></RequireAuth>
}

function CourseOverviewRoute() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  return <CourseOverview courseId={courseId} openPlayer={id => navigate(id ? `/app/courses/${courseId}/lesson/${id}` : `/app/courses/${courseId}`)} onStartTest={id => navigate(`/app/tests/${id}`)} back={() => navigate('/app/courses')} />
}

function CoursePlayerRoute() {
  const { courseId, videoId } = useParams()
  const navigate = useNavigate()
  return <CoursePlayer courseId={courseId} videoId={videoId} back={() => navigate(`/app/courses/${courseId}`)} />
}

function TestRoute() {
  const { testId } = useParams()
  const location = useLocation()
  return <TestRunner testId={testId} onBack={() => window.history.length > 1 ? window.history.back() : window.location.assign('/app/courses')} />
}

function DashboardRoute() { return <Dashboard openCourse={id => window.location.assign(`/app/courses/${id}`)} /> }
function CoursesRoute() { const navigate = useNavigate(); return <Courses openCourse={id => navigate(`/app/courses/${id}`)} onAddCourse={() => navigate('/app/courses/add')} onStartTest={id => navigate(`/app/tests/${id}`)} /> }

export function AppRoutes() {
  return <RequireAuth />
}

export { WorkspaceLayout, CourseOverviewRoute, CoursePlayerRoute, TestRoute, DashboardRoute, CoursesRoute, Teams, Chat, Leaderboard, Profile, Credits, AddCourse, Admin }
