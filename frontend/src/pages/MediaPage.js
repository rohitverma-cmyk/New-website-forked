import { Link } from "react-router-dom";
import { ExternalLink, Quote, TrendingUp, Users, Globe, Award } from "lucide-react";

const MediaPage = () => {
  const mediaCoverage = [
    {
      publication: "VCCircle",
      logo: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=100&h=100&fit=crop",
      headline: "BharatPe's Suhail Sameer, Stellaris, others back supply chain firm Locofast",
      link: "https://www.vccircle.com/bharatpe-s-suhail-sameer-stellaris-others-back-supply-chain-firm-locofast",
      color: "bg-red-500"
    },
    {
      publication: "Inc42",
      logo: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=100&h=100&fit=crop",
      headline: "Supplytech startup Locofast bags $15 Mn to invest in technology",
      link: "https://inc42.com/buzz/supplytech-startup-locofast-bags-15-mn-to-invest-in-technology/",
      color: "bg-orange-500"
    },
    {
      publication: "YourStory",
      logo: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=100&h=100&fit=crop",
      headline: "Locofast raises $15M from Chiratae, Stellaris Ventures for fashion supply chain",
      link: "https://yourstory.com/2022/02/funding-alert-locofast-chiratae-stellaris-ventures-fashion-supply",
      color: "bg-purple-500"
    },
    {
      publication: "Tech in Asia",
      logo: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=100&h=100&fit=crop",
      headline: "Textile supplychain firm weaves $15M in Series A money",
      link: "https://www.techinasia.com/textile-supplychain-firm-weaves-15m-series-money",
      color: "bg-blue-500"
    }
  ];

  const fundingHighlights = [
    { label: "Series A Funding", value: "$15M", subtext: "Mix of debt and equity" },
    { label: "Lead Investors", value: "Stellaris & Chiratae", subtext: "Venture Partners" },
    { label: "Team Growth Target", value: "500+", subtext: "Members" },
    { label: "City Expansion", value: "15+", subtext: "Cities in India" }
  ];

  const investors = [
    { name: "Stellaris Venture Partners", role: "Co-Lead" },
    { name: "Chiratae Ventures", role: "Co-Lead" },
    { name: "Axilor Ventures", role: "Participant", note: "Kris Gopalakrishnan's fund" },
    { name: "Suhail Sameer", role: "Angel", note: "Previously CEO, BharatPe" },
    { name: "Nitin Gupta", role: "Angel", note: "Founder, Uni" }
  ];

  const quotes = [
    {
      text: "This Series A funding is a pivotal moment for Locofast. It empowers us to accelerate our mission of revolutionizing the textile supply chain, bringing much-needed transparency, efficiency, and technology to an industry ripe for innovation. Our vision is to empower textile SMEs globally, and this investment brings us closer to making that a reality.",
      author: "Deepak Wadhwa",
      title: "Founder, Locofast"
    },
    {
      text: "The Indian textile sector is one of the oldest industries in the country contributing about 2% of GDP and employing over 45M people. It is a space that is ripe for digital transformation.",
      author: "Ranjith Menon",
      title: "Partner & Executive Director, Chiratae Ventures"
    }
  ];

  const growthPlans = [
    {
      icon: Globe,
      title: "Geographic Expansion",
      description: "Expand to 15+ cities in India, set up regional offices in US and Europe"
    },
    {
      icon: Users,
      title: "Team Growth",
      description: "Scale team to 500+ members across technology, operations, and business"
    },
    {
      icon: TrendingUp,
      title: "Technology Investment",
      description: "Develop existing products and launch three new product categories targeting SMEs"
    }
  ];

  const pressReleases = [
    {
      date: "Feb 2022",
      title: "Locofast raises $15 million in Series A",
      description: "Funding co-led by Stellaris Venture Partners and Chiratae Ventures to expand supplier network and technology platform."
    },
    {
      date: "2022",
      title: "Locofast expands operations to Bangladesh",
      description: "New office in Dhaka to serve international textile market and strengthen supply chain."
    },
    {
      date: "2021",
      title: "Platform launch",
      description: "Locofast B2B textile platform officially launched, connecting fabric buyers with verified suppliers."
    }
  ];

  return (
    <main className="pt-20" data-testid="media-page">
      {/* Hero Header */}
      <section className="py-16 lg:py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container-main">
          <div className="max-w-4xl">
            <span className="inline-block bg-blue-500/20 text-blue-300 text-xs font-semibold px-3 py-1 rounded-full mb-4">
              PRESS & MEDIA
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">Locofast in the News</h1>
            <p className="text-xl text-slate-300 mb-6">
              $15 Million Series A Funding | Leading Publications Cover Our Growth
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="bg-white/10 px-4 py-2 rounded-full">VCCircle</span>
              <span className="bg-white/10 px-4 py-2 rounded-full">Inc42</span>
              <span className="bg-white/10 px-4 py-2 rounded-full">YourStory</span>
              <span className="bg-white/10 px-4 py-2 rounded-full">Tech in Asia</span>
            </div>
          </div>
        </div>
      </section>

      {/* Media Coverage Cards */}
      <section className="py-16 bg-white">
        <div className="container-main">
          <div className="text-center mb-12">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-wider mb-2">Featured In</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Media Coverage</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {mediaCoverage.map((item, index) => (
              <a
                key={index}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg hover:border-slate-300 transition-all"
                data-testid={`media-card-${index}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`${item.color} w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                    {item.publication.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-slate-900">{item.publication}</span>
                      <ExternalLink size={14} className="text-slate-400 group-hover:text-blue-500" />
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed group-hover:text-slate-800">
                      "{item.headline}"
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Funding Highlights */}
      <section className="py-16 bg-blue-600">
        <div className="container-main">
          <div className="text-center mb-12">
            <p className="text-blue-200 font-semibold text-sm uppercase tracking-wider mb-2">Series A</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Funding Highlights</h2>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {fundingHighlights.map((item, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">{item.value}</div>
                <div className="text-blue-200 text-sm font-medium">{item.label}</div>
                <div className="text-blue-300 text-xs mt-1">{item.subtext}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Investor Section */}
      <section className="py-16 bg-slate-50">
        <div className="container-main">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-blue-600 font-semibold text-sm uppercase tracking-wider mb-2">Backed By</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Our Investors</h2>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {investors.map((investor, index) => (
                <div key={index} className="bg-white rounded-xl p-5 border border-slate-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <Award size={20} className="text-slate-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{investor.name}</div>
                      <div className="text-xs text-blue-600">{investor.role}</div>
                    </div>
                  </div>
                  {investor.note && (
                    <p className="text-xs text-slate-500 mt-2">{investor.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quotes Section */}
      <section className="py-16 bg-white">
        <div className="container-main">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-blue-600 font-semibold text-sm uppercase tracking-wider mb-2">What They Say</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Leadership Quotes</h2>
            </div>
            
            <div className="space-y-8">
              {quotes.map((quote, index) => (
                <div key={index} className="bg-slate-50 rounded-2xl p-8 relative">
                  <Quote size={40} className="absolute top-6 left-6 text-blue-100" />
                  <blockquote className="relative z-10">
                    <p className="text-slate-700 text-lg leading-relaxed italic mb-6 pl-8">
                      "{quote.text}"
                    </p>
                    <footer className="pl-8">
                      <div className="font-semibold text-slate-900">{quote.author}</div>
                      <div className="text-sm text-slate-500">{quote.title}</div>
                    </footer>
                  </blockquote>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Growth Plans */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="container-main">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-blue-400 font-semibold text-sm uppercase tracking-wider mb-2">Vision</p>
              <h2 className="text-3xl sm:text-4xl font-bold">Growth Plans</h2>
              <p className="text-slate-400 mt-4 max-w-2xl mx-auto">
                Enable a sophisticated tech-enabled platform for textile SMEs with market linkages across the world
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {growthPlans.map((plan, index) => (
                <div key={index} className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <plan.icon size={32} className="text-blue-400 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{plan.title}</h3>
                  <p className="text-slate-400 text-sm">{plan.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Press Releases */}
      <section className="py-16 bg-white">
        <div className="container-main">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-blue-600 font-semibold text-sm uppercase tracking-wider mb-2">Timeline</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Press Releases</h2>
            </div>
            
            <div className="space-y-6">
              {pressReleases.map((item, index) => (
                <div key={index} className="flex gap-6 items-start">
                  <div className="w-24 flex-shrink-0">
                    <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                      {item.date}
                    </span>
                  </div>
                  <div className="flex-1 pb-6 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                    <p className="text-slate-600 text-sm">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Media Contact */}
      <section className="py-16 bg-slate-50">
        <div className="container-main">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Media Enquiries</h2>
            <p className="text-slate-600 mb-6">
              For press and media enquiries, please reach out to us.
            </p>
            <a 
              href="mailto:mail@locofast.com" 
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              mail@locofast.com
            </a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default MediaPage;
