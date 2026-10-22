import { useState } from "react"
import { FlaskConical, Stethoscope, UserCog, Star, Clock, CheckCircle } from "lucide-react"
import { PageHeader } from "@/design/components/primitives"
import { StaggerContainer, StaggerItem } from "@/design/motion"
import { env } from "@/config/env"
import { formatXaf } from "@/lib/format"
import { ButtonLink } from "@/design/components/Button"

type DoctorCategory = "general" | "specialist" | "lab"

interface DoctorProfile {
  id: string
  name: string
  category: DoctorCategory
  specialty: string
  experience: string
  languages: string[]
  available: boolean
  rating: number
  consultations: number
  fee: number
}

const DOCTORS: DoctorProfile[] = [
  {
    id: "dr-001",
    name: "Dr. Ngum Peter",
    category: "general",
    specialty: "General Practice & Family Medicine",
    experience: "8 years",
    languages: ["English", "Pidgin"],
    available: true,
    rating: 4.9,
    consultations: 1240,
    fee: env.consultationFees.general,
  },
  {
    id: "dr-002",
    name: "Dr. Ekane Miriam",
    category: "general",
    specialty: "General Practice & Preventive Care",
    experience: "5 years",
    languages: ["English", "French"],
    available: true,
    rating: 4.8,
    consultations: 890,
    fee: env.consultationFees.general,
  },
  {
    id: "dr-003",
    name: "Dr. Fru Emmanuel",
    category: "general",
    specialty: "Family Medicine & Paediatrics",
    experience: "12 years",
    languages: ["English", "Pidgin", "French"],
    available: false,
    rating: 4.9,
    consultations: 2100,
    fee: env.consultationFees.general,
  },
  {
    id: "dr-004",
    name: "Dr. Ambe Thierry",
    category: "specialist",
    specialty: "Cardiology",
    experience: "10 years",
    languages: ["English", "French"],
    available: true,
    rating: 4.9,
    consultations: 680,
    fee: env.consultationFees.specialist,
  },
  {
    id: "dr-005",
    name: "Dr. Nkeng Grace",
    category: "specialist",
    specialty: "Obstetrics & Gynaecology",
    experience: "9 years",
    languages: ["English", "Pidgin"],
    available: true,
    rating: 5.0,
    consultations: 1120,
    fee: env.consultationFees.specialist,
  },
  {
    id: "dr-006",
    name: "Dr. Tabi Richard",
    category: "specialist",
    specialty: "Paediatrics",
    experience: "7 years",
    languages: ["English", "French"],
    available: false,
    rating: 4.7,
    consultations: 960,
    fee: env.consultationFees.specialist,
  },
  {
    id: "dr-007",
    name: "Dr. Mbah Lucy",
    category: "specialist",
    specialty: "Dermatology",
    experience: "6 years",
    languages: ["English", "French"],
    available: true,
    rating: 4.8,
    consultations: 540,
    fee: env.consultationFees.specialist,
  },
  {
    id: "lab-001",
    name: "Mr. Tanyi Joel",
    category: "lab",
    specialty: "Haematology & Clinical Chemistry",
    experience: "11 years",
    languages: ["English", "Pidgin"],
    available: true,
    rating: 4.9,
    consultations: 2400,
    fee: env.consultationFees.lab,
  },
  {
    id: "lab-002",
    name: "Ms. Ndi Cynthia",
    category: "lab",
    specialty: "Microbiology & Parasitology",
    experience: "7 years",
    languages: ["English", "French"],
    available: true,
    rating: 4.8,
    consultations: 1680,
    fee: env.consultationFees.lab,
  },
]

const CATEGORIES: { key: DoctorCategory; label: string; icon: React.ElementType; description: string; fee: number }[] = [
  {
    key: "general",
    label: "General Practitioners",
    icon: Stethoscope,
    description: "Family medicine, common illnesses, wellness check-ups",
    fee: env.consultationFees.general,
  },
  {
    key: "specialist",
    label: "Specialists",
    icon: UserCog,
    description: "Cardiology, OB/GYN, paediatrics, dermatology & more",
    fee: env.consultationFees.specialist,
  },
  {
    key: "lab",
    label: "Lab Technicians",
    icon: FlaskConical,
    description: "Blood work, urinalysis, microbiology, parasite screens",
    fee: env.consultationFees.lab,
  },
]

function DoctorCard({ doctor }: { doctor: DoctorProfile }) {
  const initials = doctor.name
    .replace(/^Dr\. |^Mr\. |^Ms\. /, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)

  return (
    <div className={`flex flex-col gap-4 rounded-[16px] border bg-white p-4 ${doctor.available ? "border-line" : "border-line opacity-70"}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[16px] font-extrabold text-white">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">{doctor.name}</h3>
            {doctor.available ? (
              <span className="flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-brand-700">
                <CheckCircle className="size-3" /> Available
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-ink-600">
                <Clock className="size-3" /> Busy
              </span>
            )}
          </div>
          <p className="text-sm text-ink-600">{doctor.specialty}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
        <span className="flex items-center gap-1">
          <Star className="size-3.5 fill-urgent-amber text-urgent-amber" />
          {doctor.rating} · {doctor.consultations.toLocaleString()} consultations
        </span>
        <span>{doctor.experience} experience</span>
        <span>{doctor.languages.join(", ")}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="font-display text-[18px] font-extrabold text-brand-700">{formatXaf(doctor.fee)}</span>
        <ButtonLink
          to={`/app/consult/new?type=${doctor.category}`}
          size="sm"
          trailing="arrow"
        >
          Consult
        </ButtonLink>
      </div>
    </div>
  )
}

export default function DoctorProfiles() {
  const [active, setActive] = useState<DoctorCategory>("general")
  const filtered = DOCTORS.filter((d) => d.category === active)
  const cat = CATEGORIES.find((c) => c.key === active)!

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Our Doctors"
        subtitle="Board-certified professionals available for online consultation."
      />

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active === c.key}
            onClick={() => setActive(c.key)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              active === c.key
                ? "bg-brand-700 text-white"
                : "border border-line bg-white text-ink-600 hover:bg-cream"
            }`}
          >
            <c.icon className="size-4" aria-hidden />
            {c.label}
          </button>
        ))}
      </div>

      <div className="rounded-[14px] bg-mint px-4 py-3 text-sm text-brand-900">
        <p className="font-semibold">{cat.label} — {formatXaf(cat.fee)} per consultation</p>
        <p className="mt-0.5 text-brand-700">{cat.description}</p>
      </div>

      <StaggerContainer as="div" className="flex flex-col gap-3" stagger={0.06}>
        {filtered.map((d) => (
          <StaggerItem key={d.id} variant="up">
            <DoctorCard doctor={d} />
          </StaggerItem>
        ))}
      </StaggerContainer>

      <div className="rounded-[14px] border border-line p-4 text-sm text-ink-600">
        <p className="font-semibold text-ink-900">How it works</p>
        <ol className="mt-2 space-y-1.5 list-decimal list-inside">
          <li>Choose your consultation type and describe your issue</li>
          <li>Pay the fee via Mobile Money (Fapshi)</li>
          <li>A doctor is assigned and your chat opens immediately</li>
          <li>Send text or voice notes — the doctor replies in your chat</li>
        </ol>
      </div>
    </div>
  )
}
