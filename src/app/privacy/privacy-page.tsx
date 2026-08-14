// app/privacy/page.tsx
// Public privacy policy page — required by Meta for the WhatsApp Cloud API app.
// No auth, no layout dependencies. Safe to deploy as-is.

export const metadata = {
  title: "Privacy Policy — Sri Varuni Fashion Jewellery",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-800">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Sri Varuni Fashion Jewellery · Last updated 14 August 2026
      </p>

      <section className="mt-8 space-y-4 leading-relaxed">
        <p>
          Sri Varuni Fashion Jewellery ("we", "us") operates retail stores in
          Boduppal and Zaheerabad, Telangana, India. This policy describes how
          our internal business application ("the app") handles customer
          information, including messages sent through the WhatsApp Business
          Platform.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Information we collect</h2>
        <p>
          When you shop with us or interact with us on WhatsApp, we may store
          your name, phone number, purchase and billing details, and the
          contents of messages you exchange with our business number. We do not
          collect information beyond what is needed to serve you as a customer.
        </p>

        <h2 className="pt-4 text-lg font-semibold">How we use it</h2>
        <p>
          We use this information to send transactional messages such as
          purchase receipts, payment confirmations, order updates, and to
          respond to your enquiries. We may occasionally send offers or store
          updates on WhatsApp; you can opt out at any time by replying STOP.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Sharing</h2>
        <p>
          We do not sell or rent your personal information. Messages sent via
          WhatsApp are processed by Meta Platforms as our service provider under
          the WhatsApp Business terms. Data is otherwise stored on secure cloud
          infrastructure used to run our billing system.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Retention &amp; deletion</h2>
        <p>
          Billing records are retained as required by Indian tax law. You may
          request deletion of your contact details and message history at any
          time by emailing{" "}
          <a className="underline" href="mailto:b.satwik99@gmail.com">
            b.satwik99@gmail.com
          </a>{" "}
          or telling any staff member at our stores. We will action deletion
          requests within 30 days, except records we are legally required to
          keep.
        </p>

        <h2 className="pt-4 text-lg font-semibold">Contact</h2>
        <p>
          For any questions about this policy, contact us at{" "}
          <a className="underline" href="mailto:b.satwik99@gmail.com">
            b.satwik99@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
