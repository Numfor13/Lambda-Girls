import {
  HeartHandshake,
  MapPin,
  MessageCircle,
  Shield,
  Stethoscope,
} from "lucide-react"
import { ButtonLink } from "@/design/components/Button"
import { Landscape } from "@/design/components/Landscape"
import { Reveal, StaggerContainer, StaggerItem } from "@/design/motion"

const FEATURES = [
  {
    icon: MapPin,
    title: "Find local care",
    body: "Browse facilities around Buea, check the services listed and call ahead.",
  },
  {
    icon: MessageCircle,
    title: "Reach a doctor",
    body: "Describe your concern by text or voice note. Read replies in your consultation.",
  },
  {
    icon: HeartHandshake,
    title: "Help your household",
    body: "Use one phone to ask for care for someone you help look after.",
  },
]
export default function About() {
  return (
    <>
    <section className="relative isolate overflow-hidden py-14">
        <Landscape className="-z-10" preserve="xMidYMid slice" />
        <Reveal className="container-page">
          <div className="max-w-3xl shape-bl p-6 glass-strong sm:p-10">
            <p className="eyebrow">About CareBridge · Buea</p>
            <h1 className="mt-4 text-display-m">Care, closer to home.</h1>
            <p className="mt-5 text-body-l text-ink-900">
              CareBridge helps people in Buea and nearby communities find
              facilities, check danger signs and consult a doctor, including on
              behalf of a household member.
            </p>
            <ButtonLink to="/app/facilities" icon={MapPin} className="mt-6">
              Explore facilities
            </ButtonLink>
          </div>
        </Reveal>
      </section>
      <section className="container-page section-y">
        <StaggerContainer className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {FEATURES.map((item, i) => (
            <StaggerItem
              key={item.title}
              className={`flex flex-col gap-4 p-6 ${i === 1 ? "shape-br bg-mint" : "shape-bl bg-white shadow-[var(--shadow-elev-1)]"}`}
            >
              <item.icon className="size-8 text-brand-700" aria-hidden />
              <h2 className="text-headline-s">{item.title}</h2>
              <p className="text-body-l text-ink-600">{item.body}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>
      <section className="bg-ground text-white">
      <Reveal className="container-page py-14">
          <p className="text-label-l text-white/80">Health within reach</p>
          <h2 className="mt-4 max-w-3xl text-display-m text-white">
            A little guidance. A clearer next step.
          </h2>
          <p className="mt-5 max-w-2xl text-body-l text-white/85">
            The danger-sign check is advisory, not a diagnosis. It does not
            replace care from a clinician. In an emergency, call 15 and seek
            emergency care.
          </p>
        </Reveal>
      </section>
      <StaggerContainer className="container-page grid grid-cols-1 gap-5 section-y lg:grid-cols-2">
        <StaggerItem
          as="section"
          id="providers"
          className="scroll-mt-24 rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)]"
        >
          <Stethoscope className="size-7 text-brand-700" aria-hidden />
          <h2 className="mt-4 text-headline-s">For healthcare providers</h2>
          <p className="mt-3 text-body-l text-ink-600">
            Doctors work an urgency-ordered queue, review linked triage findings
            and reply by text or voice. Prescription and referral codes can be
            checked by pharmacies and receiving facilities.
          </p>
          <ButtonLink
            to="/sign-in?returnTo=/doctor"
            variant="secondary"
            icon={Stethoscope}
            className="mt-5"
          >
            Provider sign-in
          </ButtonLink>
        </StaggerItem>
        <StaggerItem
          as="section"
          id="privacy"
          className="scroll-mt-24 rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)]"
        >
          <Shield className="size-7 text-brand-700" aria-hidden />
          <h2 className="mt-4 text-headline-s">Privacy on a shared phone</h2>
          <p className="mt-3 text-body-l text-ink-600">
            Consultations contain the health details you choose to send. Get
            permission before asking for care on another person's behalf.
            Signing out clears locally saved clinical data. You can also clear
            it from Profile; unsent items will be lost.
          </p>
        </StaggerItem>
        <StaggerItem
          as="section"
          id="contact"
          className="scroll-mt-24 rounded-xl bg-white p-6 shadow-[var(--shadow-elev-1)] lg:col-span-2"
        >
          <h2 className="text-headline-s">Get in touch about your care</h2>
          <p className="mt-3 max-w-3xl text-body-l text-ink-600">
            Use your consultation thread to ask your doctor a follow-up question
            while the case is open. To confirm facility hours or services, call
            the facility directly.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink to="/app/consults" variant="tonal" icon={MessageCircle}>
              Your consults
            </ButtonLink>
            <ButtonLink to="/app/facilities" variant="secondary" icon={MapPin}>
              Facility directory
            </ButtonLink>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </>
  )
}
