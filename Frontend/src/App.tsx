import { lazy, Suspense } from "react"
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from "react-router-dom"
import { RequireAuth } from "@/auth/RequireAuth"
import { PublicShell } from "@/app/layouts/PublicShell"
import { PatientShell } from "@/app/layouts/PatientShell"
import { RouteError } from "@/app/RouteError"
import { PageSpinner } from "@/design/components/primitives"
import { flags } from "@/config/flags"
import Landing from "@/features/landing/Landing"

const HowItWorks = lazy(() => import("@/features/public/HowItWorks"))
const About = lazy(() => import("@/features/public/About"))
const NotFound = lazy(() => import("@/features/public/NotFound"))
const SignIn = lazy(() => import("@/features/auth/SignIn"))
const AuthCallback = lazy(() => import("@/features/auth/AuthCallback"))
const CodeLookup = lazy(() => import("@/features/public/CodeLookup"))

const PatientHome = lazy(() => import("@/features/home/PatientHome"))
const FacilityList = lazy(() => import("@/features/facilities/FacilityList"))
const FacilityMap = lazy(() => import("@/features/facilities/FacilityMap"))
const FacilityDetail = lazy(() => import("@/features/facilities/FacilityDetail"))
const TriageWizard = lazy(() => import("@/features/triage/TriageWizard"))
const TriageResultPage = lazy(() => import("@/features/triage/TriageResult"))
const Profile = lazy(() => import("@/features/profile/Profile"))
const Household = lazy(() => import("@/features/profile/Household"))
const ConsultNew = lazy(() => import("@/features/consult/ConsultNew"))
const ConsultChat = lazy(() => import("@/features/consult/ConsultChat"))
const ConsultList = lazy(() => import("@/features/consult/ConsultList"))
const Payment = lazy(() => import("@/features/payments/Payment"))
const DoctorProfiles = lazy(() => import("@/features/doctors/DoctorProfiles"))
const DirectCall = lazy(() => import("@/features/calls/DirectCall"))
const RequestRide = lazy(() => import("@/features/rides/RequestRide"))
const DriverApply = lazy(() => import("@/features/rides/DriverApply"))

const DoctorShell = lazy(() =>
  import("@/app/layouts/DoctorShell").then((m) => ({ default: m.DoctorShell })),
)
const DoctorQueue = lazy(() => import("@/features/doctor/DoctorQueue"))
const DoctorCase = lazy(() => import("@/features/doctor/DoctorCase"))

const DoctorApplicationForm = lazy(() => import("@/features/doctor-application/DoctorApplicationForm"))
const ApplicationStatus = lazy(() => import("@/features/doctor-application/ApplicationStatus"))
const AdminApplications = lazy(() => import("@/features/admin/AdminApplications"))

function Root() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ScrollRestoration />
      <Outlet />
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicShell />,
        children: [
          { index: true, element: <Landing /> },
          { path: "how-it-works", element: <HowItWorks /> },
          { path: "about", element: <About /> },
          { path: "sign-in", element: <SignIn /> },
          ...(flags.prescriptions
            ? [{ path: "rx/:code", element: <CodeLookup kind="rx" /> }]
            : []),
          ...(flags.referrals ? [{ path: "ref/:code", element: <CodeLookup kind="ref" /> }] : []),
          { path: "apply/doctor", element: <DoctorApplicationForm /> },
          { path: "apply/doctor/status", element: <ApplicationStatus /> },
          { path: "apply/driver", element: <DriverApply /> },
          { path: "doctors", element: <DoctorProfiles /> },
          { path: "call", element: <DirectCall /> },
          { path: "*", element: <NotFound /> },
        ],
      },
      { path: "auth/callback", element: <AuthCallback /> },
      {
        path: "app",
        element: <PatientShell />,
        children: [
          { index: true, element: <PatientHome /> },
          { path: "facilities", element: <FacilityMap /> },
          { path: "facilities/list", element: <FacilityList /> },
          { path: "facilities/:id", element: <FacilityDetail /> },
          { path: "triage", element: <TriageWizard /> },
          { path: "triage/:resultId", element: <TriageResultPage /> },
          { path: "ride", element: <RequestRide /> },
          {
            element: <RequireAuth />,
            children: [
              { path: "consult/new", element: <ConsultNew /> },
              { path: "consult/:id", element: <ConsultChat /> },
              { path: "consult/:id/pay", element: <Payment /> },
              { path: "consults", element: <ConsultList /> },
              { path: "profile", element: <Profile /> },
              { path: "profile/household", element: <Household /> },
            ],
          },
          { path: "*", element: <NotFound /> },
        ],
      },
      {
        path: "admin",
        element: <RequireAuth role="Admin" />,
        children: [
          { path: "applications", element: <AdminApplications /> },
        ],
      },
      {
        path: "doctor",
        element: <RequireAuth role="Doctor" />,
        children: [
          {
            element: <DoctorShell />,
            children: [
              { index: true, element: <DoctorQueue /> },
              { path: "case/:id", element: <DoctorCase /> },
            ],
          },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
