const TermsPage = () => {
  return (
    <main className="pt-20" data-testid="terms-page">
      {/* Header */}
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl">
            <p className="subheading mb-4">Legal</p>
            <h1 className="text-5xl font-serif font-medium mb-6">Terms of Use</h1>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section-gap">
        <div className="container-main">
          <div className="max-w-3xl prose prose-neutral">
            <p className="text-neutral-600 leading-relaxed mb-8">
              These Terms of Use ("Terms") govern your access to and use of the Locofast platform operated by Locofast Online Services Pvt. Ltd. By using the platform, you agree to these Terms.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">1. Platform Description</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              Locofast is a B2B platform that connects fabric buyers with textile suppliers. The platform provides access to fabric catalogs, specifications, and facilitates communication between parties. Locofast acts as an intermediary and does not manufacture or sell fabrics directly.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">2. User Eligibility</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              The platform is intended for business use. By using the platform, you represent that you are authorized to conduct business transactions on behalf of your organization.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">3. User Obligations</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              When using the platform, you agree to:
            </p>
            <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-6">
              <li>Provide accurate and complete information</li>
              <li>Use the platform only for lawful business purposes</li>
              <li>Not interfere with or disrupt the platform's operation</li>
              <li>Not attempt to access data not intended for you</li>
            </ul>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">4. Platform Role</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              Locofast facilitates connections between buyers and suppliers. All transactions are conducted directly between buyers and suppliers. Locofast is not a party to any transaction and does not guarantee product quality, delivery, or payment terms. Buyers and suppliers are responsible for their own due diligence.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">5. Intellectual Property</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              All content on the platform, including text, images, logos, and software, is owned by Locofast or its licensors. You may not copy, modify, or distribute any content without prior written permission.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">6. Limitation of Liability</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              Locofast is not liable for any direct, indirect, or consequential damages arising from your use of the platform or transactions with suppliers. The platform is provided "as is" without warranties of any kind.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">7. Indemnification</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              You agree to indemnify Locofast against any claims, damages, or expenses arising from your use of the platform or violation of these Terms.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">8. Modifications</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              Locofast may modify these Terms at any time. Changes will be communicated via email or notice on the platform. Continued use of the platform after changes constitutes acceptance of the modified Terms.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">9. Governing Law</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in New Delhi.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">10. Contact</h2>
            <p className="text-neutral-600 leading-relaxed">
              For questions about these Terms, contact us at mail@locofast.com.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default TermsPage;
