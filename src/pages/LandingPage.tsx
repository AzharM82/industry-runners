import { Navbar, Hero, Features, Pricing, FAQ, Footer } from '../components/landing';

interface LandingPageProps {
  onLogin: () => void;
  onSubscribe: () => void;
}

export function LandingPage({ onLogin, onSubscribe }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <Navbar onLogin={onLogin} onSubscribe={onSubscribe} />
      <main>
        <Hero onGetStarted={onSubscribe} />
        <Features />
        <Pricing onSubscribe={onSubscribe} />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
