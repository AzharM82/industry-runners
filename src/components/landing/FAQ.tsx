const faqs = [
  {
    question: 'What happens when I cancel?',
    answer: 'Your access continues until the end of your current billing period. After that, you\'ll lose access to the analysis tools.',
  },
  {
    question: 'Do you offer refunds?',
    answer: 'No. You can cancel your subscription anytime with no questions asked, and you\'ll retain access until the end of your billing period.',
  },
  {
    question: 'What data sources do you use?',
    answer: 'We use Polygon.io for real-time market data and Claude AI for analysis. For Halal checks, we cross-reference multiple Islamic finance platforms.',
  },
  {
    question: 'How accurate is the analysis?',
    answer: 'Our analysis is AI-generated using institutional-quality frameworks. It should be used as a research tool, not as financial advice. Always do your own due diligence.',
  },
  {
    question: 'Can I upgrade my limits?',
    answer: 'Currently we offer one plan with 30 analyses per tool per month. Contact us if you need higher limits.',
  },
];

export function FAQ() {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
          Frequently asked questions
        </h2>

        <div className="space-y-6">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="bg-white rounded-xl p-6 border border-gray-100"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {faq.question}
              </h3>
              <p className="text-gray-600">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
