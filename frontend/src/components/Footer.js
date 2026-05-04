import { Link } from "react-router-dom";
import { Linkedin, Facebook, Instagram, Youtube, CheckCircle, Shield, Truck, CreditCard, ArrowRight } from "lucide-react";

const Footer = () => {
  const offices = [
    { 
      city: "New Delhi", 
      address: ["Desk Connect - First Floor,", "Plot No-2, Kh.No. 384/2, 100", "feet Rd, Mehrauli-Gurgaon", "Rd, Opp. Corporation Bank,", "Ghitorni, New Delhi 110030"],
      type: "Headquarters" 
    },
    { 
      city: "Noida", 
      address: ["1st Floor, Plot No.D-107,", "Vyapar Marg, D Block, Noida", "Sector-2 Uttar Pradesh", "201301"]
    },
    { 
      city: "Gurugram", 
      address: ["NH8-Udyog Vihar, 90B, Delhi", "- Jaipur Expy, Udyog Vihar,", "Sector 18, Gurugram,", "Haryana 122008"]
    },
    { 
      city: "Jaipur", 
      address: ["34/6, Kiran Path,", "Mansarovar Sector 3,", "Mansarovar, Jaipur,", "Rajasthan 302020"]
    },
    { 
      city: "Ahmedabad", 
      address: ["SSPACIA 4th floor, Agrawal", "Complex, Chimanlal", "Girdharlal Rd, Ahmedabad,", "Gujarat, 380009"]
    },
    { 
      city: "Bangladesh", 
      address: ["Workstation 101, Uttara", "Tower, Level 4, 1 Jashimuddin", "Avenue, Sector 3, Uttara C/A", "Dhaka 1230, Bangladesh"]
    },
  ];

  const supplierBenefits = [
    {
      icon: Shield,
      title: "Payment Protection",
      description: "Secure payment protection for all transactions"
    },
    {
      icon: Truck,
      title: "Logistics Support",
      description: "End-to-end dispatch and shipment tracking"
    },
    {
      icon: CreditCard,
      title: "Instant Settlements",
      description: "Quick payments once orders are confirmed"
    },
    {
      icon: CheckCircle,
      title: "Verified Buyer Network",
      description: "Access to pre-qualified brands and manufacturers"
    }
  ];

  return (
    <footer className="bg-[#1F2937] text-white" data-testid="footer">
      {/* Supplier Value Proposition Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="container-main py-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Left - Main Message */}
            <div>
              <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
                FOR SUPPLIERS
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Sell Fabrics Smarter with Locofast
              </h2>
              <p className="text-blue-100 mb-6 text-base">
                Pay-for-performance B2B marketplace. Connect directly with verified buyers and grow your business.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="mailto:mail@locofast.com?subject=Supplier%20Enquiry"
                  className="inline-flex items-center gap-2 bg-white text-blue-600 px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                  data-testid="supplier-cta"
                >
                  Start Selling Today
                  <ArrowRight size={18} />
                </a>
              </div>
            </div>
            
            {/* Right - Benefits Grid */}
            <div className="grid grid-cols-2 gap-4">
              {supplierBenefits.map((benefit, index) => (
                <div 
                  key={index}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/15 transition-colors"
                >
                  <benefit.icon className="w-8 h-8 text-blue-200 mb-2" />
                  <h4 className="font-semibold text-white text-sm mb-1">{benefit.title}</h4>
                  <p className="text-blue-200 text-xs">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Trust Badges */}
          <div className="mt-8 pt-6 border-t border-white/20 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-sm text-blue-100">
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-300" />
                500+ Active Suppliers
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-300" />
                5,000+ Orders Executed
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-300" />
                700+ Brands Served
              </span>
            </div>
            <div className="text-xs text-blue-200">
              Backed by <a href="https://www.stellarisvp.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Stellaris Ventures</a>, <a href="https://www.chiratae.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Chiratae Ventures</a> & Axilor
            </div>
          </div>
        </div>
      </div>

      {/* Offices Section */}
      <div className="border-b border-gray-700">
        <div className="container-main py-16">
          <h3 className="text-xl font-semibold mb-8">Our Offices</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
            {offices.map((office, index) => (
              <div key={index}>
                <p className="font-medium text-white mb-2">
                  {office.city}
                </p>
                <div className="text-neutral-400 text-sm leading-relaxed">
                  {office.address.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container-main py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
          {/* Brand & Social */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link to="/" className="inline-block mb-6">
              <img 
                src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg" 
                alt="Locofast" 
                className="h-8 brightness-0 invert"
              />
            </Link>
            <div className="flex items-center gap-4 mt-4">
              <a 
                href="https://in.linkedin.com/company/locofast" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin size={20} />
              </a>
              <a 
                href="https://www.facebook.com/Locofast/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={20} />
              </a>
              <a 
                href="https://www.instagram.com/locofast_official" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={20} />
              </a>
              <a 
                href="https://www.youtube.com/channel/UCpbLo84Y_BVTcIzHHrBjIkw" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="YouTube"
              >
                <Youtube size={20} />
              </a>
            </div>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="subheading text-neutral-500 mb-4">Company</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/about-us" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-about">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/customers" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-customers">
                  Customers
                </Link>
              </li>
              <li>
                <Link to="/suppliers" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-suppliers">
                  Suppliers
                </Link>
              </li>
              <li>
                <Link to="/media" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-media">
                  Media & Awards
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="subheading text-neutral-500 mb-4">Resources</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/rfq" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-rfq">
                  Request for Quote
                </Link>
              </li>
              <li>
                <Link to="/blog" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-blog">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/careers" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-careers">
                  Life at Locofast
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-faq">
                  FAQs
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-terms">
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link to="/tools" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-tools">
                  Free Tools
                </Link>
              </li>
            </ul>
          </div>

          {/* Fabrics Links */}
          <div>
            <h4 className="subheading text-neutral-500 mb-4">Fabrics</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/fabrics" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-fabrics">
                  Browse All Fabrics
                </Link>
              </li>
              <li>
                <Link to="/fabrics?category=cat-denim" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-denim">
                  Denim Fabrics
                </Link>
              </li>
              <li>
                <Link to="/fabrics?category=cat-knits" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-poly-knit">
                  Poly Knit Fabrics
                </Link>
              </li>
              <li>
                <Link to="/assisted-sourcing" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-sourcing">
                  Assisted Sourcing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="subheading text-neutral-500 mb-4">Contact</h4>
            <ul className="space-y-3">
              <li>
                <a href="tel:+918920392418" className="text-neutral-300 hover:text-white transition-colors text-sm">
                  +91 8920 392 418
                </a>
              </li>
              <li>
                <a href="mailto:mail@locofast.com" className="text-neutral-300 hover:text-white transition-colors text-sm">
                  mail@locofast.com
                </a>
              </li>
              <li className="pt-2">
                <Link to="/rfq" className="text-neutral-300 hover:text-white transition-colors text-sm" data-testid="footer-contact">
                  Request a Quote
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-neutral-500 text-sm">
            © {new Date().getFullYear()} Locofast Online Services Pvt. Ltd.
          </p>
          <Link to="/admin/login" className="text-neutral-600 hover:text-neutral-400 text-sm transition-colors" data-testid="admin-link">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
