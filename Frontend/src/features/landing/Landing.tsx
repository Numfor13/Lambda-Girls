import {
  CloudDownload,
  FileText,
  FlaskConical,
  HeartHandshake,
  MapPin,
  MessageCircleMore,
  MessagesSquare,
  Stethoscope,
  WifiOff,
} from "lucide-react"
import { flags } from "@/config/flags"
import { ButtonLink, LinkArrow } from "@/design/components/Button"
import { ImageCard } from "@/design/components/ImageCard"
import { AdvisoryNote, Eyebrow, FeaturePill, InfoCard } from "@/design/components/primitives"
import { DoctorPortrait, FacilitiesPhone, HeartIllustration, HeroPhone } from "./illustrations"

const consultEntry = flags.doctors_available ? "/app/doctors" : "/app/consult/new"
const appointmentsEntry = flags.appointments ? "/app/appointments/new" : "/app/facilities"
const labEntry = flags.lab_tests ? "/app/lab-tests/new" : "/app/facilities?capability=laboratory"

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container-page grid items-center gap-12 pt-10 pb-14 lg:grid-cols-[1.05fr_1fr] lg:pt-14 lg:pb-20">
        <div>
          <Eyebrow>Health within reach</Eyebrow>
          <h1 className="mt-5 text-[44px] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[56px] lg:text-[64px]">
            Better care.
            <br />
            Closer to you.
          </h1>
          <p className="mt-6 max-w-[440px] text-[17px] leading-[27px] text-ink-600">
            Find nearby facilities, message a doctor, and take your next step with confidence.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <ButtonLink to="/app/facilities?locate=1" trailing="arrow" size="lg" className="px-6">
              Find care near me
            </ButtonLink>
            <ButtonLink
              to="/app/consult/new"
              variant="secondary"
              trailing="external"
              size="lg"
              className="px-6"
            >
              Message a doctor
            </ButtonLink>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-4">
            <FeaturePill icon={MapPin} label="Nearby facilities" />
            <FeaturePill icon={MessageCircleMore} label="Text & voice notes" />
            <FeaturePill icon={WifiOff} label="Offline access" />
          </div>
        </div>

        <div className="relative mx-auto flex h-[520px] w-full max-w-[520px] items-center justify-center lg:h-[560px]">
          <div className="absolute top-1/2 left-1/2 size-[420px] -translate-x-[42%] -translate-y-1/2 rounded-full bg-mint sm:size-[480px]" />
          <div className="relative rotate-[4deg]">
            <HeroPhone />
          </div>
          <div className="absolute top-[22%] right-0 w-[150px] rounded-[16px] bg-white p-4 shadow-[var(--shadow-float)] sm:right-2 sm:w-[170px]">
            <MessagesSquare className="size-6 text-brand-700" strokeWidth={1.75} aria-hidden />
            <p className="mt-2 font-display text-[16px] leading-[20px] font-bold text-ink-900">
              Care, one conversation away.
            </p>
            <span className="mt-3 block h-0.5 w-10 rounded bg-mint-200" />
          </div>
        </div>
      </div>
    </section>
  )
}

function SymptomSection() {
  return (
    <section className="bg-cream">
      <div className="container-page grid items-center gap-12 section-y lg:grid-cols-[1fr_1.05fr]">
        <div>
          <Eyebrow>A clearer next step</Eyebrow>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-bold tracking-[-0.02em] lg:text-[40px]">
            Understand your symptoms.
            <br />
            Know where to turn.
          </h2>
          <p className="mt-5 max-w-[440px] text-[17px] leading-[27px] text-ink-600">
            Answer a few questions to understand how urgently you should seek care.
          </p>
          <ButtonLink to="/app/triage" trailing="arrow" className="mt-8 px-6">
            Explore symptom guidance
          </ButtonLink>
          <AdvisoryNote className="mt-6" />
        </div>

        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_200px]">
          <div className="relative flex items-center justify-center">
            <div className="absolute size-[300px] rounded-full bg-mint sm:size-[340px]" />
            <HeartIllustration className="relative h-[320px] w-auto drop-shadow-[0_24px_30px_rgba(120,20,15,0.25)] sm:h-[360px]" />
            <svg
              className="pointer-events-none absolute inset-0 hidden size-full md:block"
              aria-hidden
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <path d="M70 30 H86 V18 H100" fill="none" stroke="#2e8b5e" strokeDasharray="1.5 1.5" strokeWidth=".4" />
              <path d="M62 62 H86 V68 H100" fill="none" stroke="#2e8b5e" strokeDasharray="1.5 1.5" strokeWidth=".4" />
              <circle cx="70" cy="30" r="1.2" fill="#2e8b5e" />
              <circle cx="62" cy="62" r="1.2" fill="#2e8b5e" />
            </svg>
          </div>
          <div className="flex flex-col gap-6 md:gap-16">
            <InfoCard icon={FileText} title="Tell us how you feel">
              Answer a few simple questions about your symptoms.
            </InfoCard>
            <InfoCard icon={MapPin} title="Find your next step">
              Get guidance on the right level of care and where to go in Buea.
            </InfoCard>
          </div>
        </div>
      </div>
    </section>
  )
}

function EverydayCare() {
  return (
    <section className="container-page section-y">
      <Eyebrow>Everyday care</Eyebrow>
      <h2 className="mt-4 text-[32px] leading-[1.1] font-bold tracking-[-0.02em] lg:text-[40px]">
        Care that fits your everyday.
      </h2>
      <p className="mt-3 text-[17px] text-ink-600">For you, your family, and your community.</p>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_0.95fr_1.05fr]">
        <div className="relative flex min-h-[280px] overflow-hidden rounded-[16px] bg-mint">
          <div className="mt-6 ml-4 self-end sm:ml-6">
            <FacilitiesPhone />
          </div>
          <div className="flex flex-1 flex-col justify-center p-5">
            <CloudDownload className="size-10 text-brand-700" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 font-display text-[20px] leading-tight font-bold">
              Useful, even offline
            </p>
            <p className="mt-2 text-[13px] leading-5 text-ink-600">
              Access saved facility details when your connection drops.
            </p>
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col rounded-[16px] border border-line bg-white p-6">
          <div className="flex items-center -space-x-3" aria-hidden>
            <DoctorPortrait skin="#8a5a3c" className="size-16 rounded-full ring-2 ring-white" />
            <DoctorPortrait skin="#5e3a24" className="z-10 size-20 rounded-full ring-2 ring-white" />
            <DoctorPortrait skin="#7a4b30" className="size-16 rounded-full ring-2 ring-white" />
          </div>
          <p className="mt-5 font-display text-[20px] leading-tight font-bold">
            A human when
            <br />
            you need one
          </p>
          <p className="mt-2 text-[14px] text-ink-600">Consult through text and voice notes.</p>
          <ButtonLink to={consultEntry} trailing="arrow" size="md" full className="mt-auto">
            Explore consultations
          </ButtonLink>
        </div>

        <ImageCard
          to="/app/profile/household"
          image="/images/care-for-family.jpg"
          fallbackIcon={HeartHandshake}
          fallbackTone="from-[#a8743f] via-[#6f4a2a] to-[#2d4a35]"
          title="Care for someone you love"
          subtitle="Request care on behalf of family."
          chip="arrow-bottom"
          className="min-h-[280px]"
        />
      </div>
    </section>
  )
}

function Services() {
  return (
    <section id="services" className="container-page scroll-mt-24 pb-14 lg:pb-24">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1fr_1fr] lg:gap-5">
        <div className="flex flex-col justify-center lg:pr-6">
          <Eyebrow>Our services</Eyebrow>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-bold tracking-[-0.02em] lg:text-[36px]">
            Your next step
            <br />
            to better health.
          </h2>
          <p className="mt-4 text-[17px] leading-[27px] text-ink-600">
            Practical support, from your first question to your next appointment.
          </p>
          <div className="mt-8 flex flex-col items-start gap-5">
            <LinkArrow to="/app/facilities">Find a facility</LinkArrow>
            <LinkArrow to={appointmentsEntry}>Book an appointment</LinkArrow>
          </div>
        </div>
        <ImageCard
          to="/app/consult/new"
          image="/images/message-a-doctor.jpg"
          fallbackIcon={Stethoscope}
          title="Message a doctor"
          subtitle="Get professional advice through text and voice notes."
          className="h-[300px]"
        />
        <ImageCard
          to={labEntry}
          image="/images/request-lab-test.jpg"
          fallbackIcon={FlaskConical}
          fallbackTone="from-[#3c5a74] via-[#2b4458] to-[#162b38]"
          title="Request a lab test"
          subtitle="Find a lab near you and prepare for your visit."
          className="h-[300px]"
        />
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <Hero />
      <SymptomSection />
      <EverydayCare />
      <Services />
    </>
  )
}
