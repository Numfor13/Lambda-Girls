import { Eyebrow } from "@/design/components/primitives"
import { ButtonLink } from "@/design/components/Button"

const ROADMAP = [
  "Community care booths with solar-powered kiosks",
  "SMS and USSD on any phone, including Pidgin voice menus",
  "Medication and antenatal reminders",
  "Patient-held records you can carry on a card",
]

export default function About() {
  return (
    <div className="container-page section-y">
      <Eyebrow>About CareBridge</Eyebrow>
      <h1 className="mt-4 max-w-3xl text-[36px] leading-[1.08] font-extrabold tracking-[-0.02em] lg:text-[48px]">
        Connecting communities with care.
      </h1>
      <p className="mt-6 max-w-2xl text-[17px] leading-[28px] text-ink-600">
        CareBridge helps people in Buea and the surrounding communities of the South West Region
        find the right care quickly — even with a weak signal or none at all. We bring together 40
        local facilities, a danger-sign symptom check and doctors you can reach by text or voice
        note.
      </p>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <section id="providers" className="scroll-mt-24 rounded-[16px] border border-line p-6">
          <h2 className="text-[22px] font-bold">For healthcare providers</h2>
          <p className="mt-2 text-[15px] text-ink-600">
            Doctors see a queue ordered by urgency, with the reasons behind every symptom check.
            Pharmacies and facilities can verify prescription and referral codes in seconds.
          </p>
        </section>
        <section className="rounded-[16px] border border-line p-6">
          <h2 className="text-[22px] font-bold">What's coming next</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-ink-600">
            {ROADMAP.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section id="privacy" className="scroll-mt-24 rounded-[16px] border border-line p-6">
          <h2 className="text-[22px] font-bold">Privacy & terms</h2>
          <p className="mt-2 text-[15px] text-ink-600">
            Your health information is used only to give you care. Records for a family member are
            kept apart from your own. Logging out removes health data saved on the phone, which
            matters on shared devices. Symptom guidance is advisory and never a diagnosis.
          </p>
        </section>
        <section id="contact" className="scroll-mt-24 rounded-[16px] border border-line p-6">
          <h2 className="text-[22px] font-bold">Contact us</h2>
          <p className="mt-2 text-[15px] text-ink-600">
            Based in Buea, South West Region, Cameroon. For partnerships or facility updates,
            reach the CareBridge team through your local health district office.
          </p>
        </section>
      </div>

      <ButtonLink to="/app" trailing="arrow" className="mt-10">
        Get started
      </ButtonLink>
    </div>
  )
}
