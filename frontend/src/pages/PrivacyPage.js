const PrivacyPage = () => {
  return (
    <main className="pt-20" data-testid="privacy-page">
      {/* Header */}
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-main">
          <div className="max-w-3xl">
            <p className="subheading mb-4">Legal</p>
            <h1 className="text-5xl font-serif font-medium mb-6">Privacy Policy</h1>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section-gap">
        <div className="container-main">
          <div className="max-w-3xl prose prose-neutral">
            <p className="text-neutral-600 leading-relaxed mb-8">
              Locofast Online Services Pvt. Ltd. ("Company", "we", "us") is committed to protecting and maintaining the privacy of all users. This Privacy Policy describes how we collect, store, use, and disclose your information when you use the Locofast platform.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">1. Purpose</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              This Privacy Policy ensures that:
            </p>
            <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-6">
              <li>You are aware of what information you provide to us and how it is used</li>
              <li>You understand the rights available to you regarding your data</li>
              <li>Your information is processed and stored in accordance with applicable laws</li>
            </ul>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">2. Information We Collect</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              We collect information that you provide when using the platform, including:
            </p>
            <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-6">
              <li>Contact information (name, email, phone number, company name)</li>
              <li>Enquiry details and communication history</li>
              <li>Usage data and platform activity</li>
            </ul>
            <p className="text-neutral-600 leading-relaxed mb-4">
              <strong>Cookies:</strong> The platform may use cookies to help you access certain functions. Cookies do not collect personal identifying information.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">3. Information Storage and Security</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              All information collected is stored on secure third-party servers. We implement industry-standard measures to protect your data, including:
            </p>
            <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-6">
              <li>Encryption of data using secure server software</li>
              <li>Regular review of information collection and storage practices</li>
              <li>Limited disclosure to employees and partners on a need-to-know basis</li>
            </ul>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">4. Information We Share</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              We may disclose information:
            </p>
            <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-6">
              <li>As required under applicable law or legal process</li>
              <li>To respond to requests from government authorities</li>
              <li>To enforce our Terms of Use</li>
              <li>With suppliers to fulfill your enquiry requests (with your consent)</li>
            </ul>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">5. Your Rights</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 text-neutral-600 space-y-2 mb-6">
              <li>Request deletion of your personal information</li>
              <li>Rectify or modify any inaccurate information</li>
              <li>Restrict how your information is processed</li>
              <li>Request a copy of your data</li>
            </ul>
            <p className="text-neutral-600 leading-relaxed mb-6">
              To exercise any of these rights, contact us at mail@locofast.com.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">6. Changes to This Policy</h2>
            <p className="text-neutral-600 leading-relaxed mb-6">
              If there are changes to this Privacy Policy, we will notify you via email at least 1 week prior to the enforcement of such changes. A notice will also be displayed on the platform.
            </p>

            <h2 className="text-2xl font-serif font-medium mt-12 mb-4">7. Contact</h2>
            <p className="text-neutral-600 leading-relaxed mb-4">
              Questions regarding this Privacy Policy should be directed to:
            </p>
            <p className="text-neutral-600 leading-relaxed mb-4">
              <strong>Email:</strong> mail@locofast.com
            </p>
            <p className="text-neutral-600 leading-relaxed">
              <strong>Grievance Officer:</strong><br />
              Name: Mohit Piplani<br />
              Email: mohit@locofast.com
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default PrivacyPage;
