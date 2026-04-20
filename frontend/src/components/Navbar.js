import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, MessageCircle, User, LogOut } from "lucide-react";
import RFQModal from "./RFQModal";
import CustomerLoginModal from "./CustomerLoginModal";
import { useCustomerAuth } from "../context/CustomerAuthContext";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showRfq, setShowRfq] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { customer, isLoggedIn, logout } = useCustomerAuth();
  const location = useLocation();

  const navLinks = [
    { path: "/", label: "Home" },
    { path: "/about-us", label: "About" },
    { path: "/suppliers", label: "Sellers sign up", highlight: true },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100" data-testid="navbar">
        <div className="container-main">
          <div className="flex items-center justify-between h-20">
            <Link to="/" className="flex items-center" data-testid="navbar-logo">
              <img 
                src="https://customer-assets.emergentagent.com/job_locofast-cms/artifacts/xkuf449w_Locofast%20-%20Medium.svg" 
                alt="Locofast" 
                className="h-8"
                width={120}
                height={32}
                fetchPriority="high"
              />
            </Link>

            <div className="hidden md:flex items-center gap-10">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  data-testid={`nav-link-${link.label.toLowerCase().replace(/\s/g, '-')}`}
                  className={`text-sm font-medium transition-colors duration-200 ${
                    link.highlight
                      ? "text-[#2563EB] hover:text-blue-700"
                      : isActive(link.path)
                        ? "text-[#2563EB]"
                        : "text-gray-600 hover:text-[#2563EB]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={() => {
                  if (location.pathname === '/') {
                    document.querySelector('[data-testid="credit-section"]')?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    window.location.href = '/#apply-credit';
                  }
                }}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors duration-200"
                data-testid="nav-apply-credit"
              >
                Apply for Credit
              </button>
              <button
                onClick={() => setShowRfq(true)}
                className="text-sm font-medium text-gray-600 hover:text-[#2563EB] transition-colors duration-200 flex items-center gap-1.5"
                data-testid="nav-link-request-quote"
              >
                <MessageCircle size={14} />
                Request Quote
              </button>
            </div>

            <div className="hidden md:flex items-center gap-3">
              {isLoggedIn ? (
                <div className="flex items-center gap-2">
                  <Link
                    to="/account"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors"
                    data-testid="nav-my-account"
                  >
                    <User size={16} />
                    {customer?.name || "My Account"}
                  </Link>
                  <Link to="/fabrics" className="btn-primary inline-block" data-testid="nav-browse-btn">
                    Instant Booking
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowLogin(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-[#2563EB] border border-gray-200 rounded-lg hover:bg-blue-50 transition-colors"
                    data-testid="nav-login-btn"
                  >
                    <User size={16} />
                    Login
                  </button>
                  <Link to="/fabrics" className="btn-primary inline-block" data-testid="nav-browse-btn">
                    Instant Booking
                  </Link>
                </div>
              )}
            </div>

            <button
              className="md:hidden p-2 text-neutral-900"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="mobile-menu-btn"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-neutral-100 animate-slideDown" data-testid="mobile-menu">
            <div className="container-main py-6 space-y-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileOpen(false)}
                  className={`block text-lg font-medium ${
                    link.highlight 
                      ? "text-[#2563EB]" 
                      : isActive(link.path) 
                        ? "text-[#2563EB]" 
                        : "text-gray-600"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={() => { setMobileOpen(false); setShowRfq(true); }}
                className="block text-lg font-medium text-gray-600"
              >
                Request Quote
              </button>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  if (location.pathname === '/') {
                    document.querySelector('[data-testid="credit-section"]')?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    window.location.href = '/#apply-credit';
                  }
                }}
                className="block text-lg font-medium text-emerald-600"
              >
                Apply for Credit
              </button>
              {isLoggedIn ? (
                <>
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="block text-lg font-medium text-gray-600">
                    My Account
                  </Link>
                  <button onClick={() => { logout(); setMobileOpen(false); }} className="block text-lg font-medium text-red-500">
                    Logout
                  </button>
                </>
              ) : (
                <button onClick={() => { setMobileOpen(false); setShowLogin(true); }} className="block text-lg font-medium text-[#2563EB]">
                  Login
                </button>
              )}
              <Link
                to="/fabrics"
                onClick={() => setMobileOpen(false)}
                className="btn-primary inline-block mt-4"
              >
                Instant Booking
              </Link>
            </div>
          </div>
        )}
      </nav>

      <RFQModal open={showRfq} onClose={() => setShowRfq(false)} />
      <CustomerLoginModal open={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
};

export default Navbar;
