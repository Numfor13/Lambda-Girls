import { lazy, Suspense } from "react"
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  ScrollRestoration,
} from "react-router-dom"
import { RequireAuth } from "@/auth/RequireAuth"
import { PublicShell } from "@/app/layouts/PublicShell"
import { PatientShell } from "@/app/layouts/PatientShell"
import { RouteError } from "@/app/RouteError"
import { PageSpinner } from "@/design/components/primitives"
import { flags } from "@/config/flags"
import Landing from "@/features/landing/Landing"

const HowItWorks = lazy(() => import("@/features/public/HowItWorks"))
const About = lazy(() => import("@/features/public/About"))
const HealthTips = lazy(() => import("@/features/services/HealthTips"))
const Appointments = lazy(() => import("@/features/services/Appointments"))
const Labs = lazy(() => import("@/features/services/Labs"))
const LabDetail = lazy(() =>
  import("@/features/services/Labs").then((m) => ({ default: m.LabDetail }))
)
const Blood = lazy(() => import("@/features/services/Blood"))
const History = lazy(() => import("@/features/services/History"))
const AnonymousAsk = lazy(() => import("@/features/anonymous/AnonymousAsk"))
const OperatorShell = lazy(() =>
  import("@/app/layouts/OperatorShell").then((m) => ({
    default: m.OperatorShell,
  }))
)
const AdminShell = lazy(() =>
  import("@/app/layouts/AdminShell").then((m) => ({ default: m.AdminShell }))
)
const OperatorCallbacks = lazy(
  () => import("@/features/operator/OperatorConsole")
)
const OperatorDispatch = lazy(() =>
  import("@/features/operator/OperatorConsole").then((m) => ({
    default: m.OperatorDispatch,
  }))
)
const OperatorEmergencies = lazy(() =>
  import("@/features/operator/OperatorConsole").then((m) => ({
    default: m.OperatorEmergencies,
  }))
)
const OperatorBlood = lazy(() =>
  import("@/features/operator/OperatorConsole").then((m) => ({
    default: m.OperatorBlood,
  }))
)
const OperatorLabs = lazy(() =>
  import("@/features/operator/OperatorConsole").then((m) => ({
    default: m.OperatorLabs,
  }))
)
const AdminFacilities = lazy(() => import("@/features/admin/AdminConsole"))
const AdminTips = lazy(() =>
  import("@/features/admin/AdminConsole").then((m) => ({
    default: m.AdminTips,
  }))
)
const AdminAppointments = lazy(() =>
  import("@/features/admin/AdminConsole").then((m) => ({
    default: m.AdminAppointments,
  }))
)
const NotFound = lazy(() => import("@/features/public/NotFound"))
const SignIn = lazy(() => import("@/features/auth/SignIn"))
const AuthCallback = lazy(() => import("@/features/auth/AuthCallback"))
const CodeLookup = lazy(() => import("@/features/public/CodeLookup"))

const PatientHome = lazy(() => import("@/features/home/PatientHome"))
const FacilityList = lazy(() => import("@/features/facilities/FacilityList"))
const FacilityDetail = lazy(
  () => import("@/features/facilities/FacilityDetail")
)
const TriageWizard = lazy(() => import("@/features/triage/TriageWizard"))
const TriageResultPage = lazy(() => import("@/features/triage/TriageResult"))
const Profile = lazy(() => import("@/features/profile/Profile"))
const Household = lazy(() => import("@/features/profile/Household"))
const ConsultNew = lazy(() => import("@/features/consult/ConsultNew"))
const ConsultChat = lazy(() => import("@/features/consult/ConsultChat"))
const ConsultList = lazy(() => import("@/features/consult/ConsultList"))
const Payment = lazy(() => import("@/features/payments/Payment"))

const DoctorShell = lazy(() =>
  import("@/app/layouts/DoctorShell").then((m) => ({ default: m.DoctorShell }))
)
const DoctorQueue = lazy(() => import("@/features/doctor/DoctorQueue"))
const DoctorCase = lazy(() => import("@/features/doctor/DoctorCase"))

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
          ...(flags.health_tips
            ? [{ path: "tips", element: <HealthTips /> }]
            : []),
          ...(flags.anonymous
            ? [
                { path: "ask", element: <AnonymousAsk /> },
                { path: "ask/:id", element: <AnonymousAsk /> },
              ]
            : []),
          { path: "sign-in", element: <SignIn /> },
          ...(flags.prescriptions
            ? [
                { path: "rx", element: <CodeLookup kind="rx" /> },
                { path: "rx/:code", element: <CodeLookup kind="rx" /> },
              ]
            : []),
          ...(flags.referrals
            ? [
                { path: "ref", element: <CodeLookup kind="ref" /> },
                { path: "ref/:code", element: <CodeLookup kind="ref" /> },
              ]
            : []),
          { path: "*", element: <NotFound /> },
        ],
      },
      { path: "auth/callback", element: <AuthCallback /> },
      {
        path: "app",
        element: <PatientShell />,
        children: [
          { index: true, element: <PatientHome /> },
          { path: "facilities", element: <FacilityList /> },
          { path: "facilities/:id", element: <FacilityDetail /> },
          { path: "triage", element: <TriageWizard /> },
          { path: "triage/:resultId", element: <TriageResultPage /> },
          {
            element: <RequireAuth />,
            children: [
              { path: "consult/new", element: <ConsultNew /> },
              { path: "consult/:id", element: <ConsultChat /> },
              { path: "consult/:id/pay", element: <Payment /> },
              { path: "consults", element: <ConsultList /> },
              { path: "profile", element: <Profile /> },
              { path: "profile/household", element: <Household /> },
              ...(flags.appointments
                ? [{ path: "appointments", element: <Appointments /> }]
                : []),
              ...(flags.lab_tests
                ? [
                    { path: "labs", element: <Labs /> },
                    { path: "labs/:id", element: <LabDetail /> },
                  ]
                : []),
              ...(flags.blood ? [{ path: "blood", element: <Blood /> }] : []),
              ...(flags.consult_history || flags.receipts
                ? [{ path: "history", element: <History /> }]
                : []),
            ],
          },
          { path: "*", element: <NotFound /> },
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
      ...(flags.operator_console
        ? [
            {
              path: "operator",
              element: <RequireAuth role="Operator" />,
              children: [
                {
                  element: <OperatorShell />,
                  children: [
                    { index: true, element: <OperatorCallbacks /> },
                    { path: "dispatch", element: <OperatorDispatch /> },
                    { path: "emergencies", element: <OperatorEmergencies /> },
                    { path: "blood", element: <OperatorBlood /> },
                    { path: "labs", element: <OperatorLabs /> },
                    { path: "*", element: <NotFound /> },
                  ],
                },
              ],
            },
            {
              path: "admin",
              element: <RequireAuth role="Admin" />,
              children: [
                {
                  element: <AdminShell />,
                  children: [
                    { index: true, element: <AdminFacilities /> },
                    { path: "tips", element: <AdminTips /> },
                    { path: "appointments", element: <AdminAppointments /> },
                    { path: "*", element: <NotFound /> },
                  ],
                },
              ],
            },
          ]
        : []),
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
