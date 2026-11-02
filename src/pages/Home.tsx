export default function Home() {
  return (
    <div className="mt-10">
      {/* Gradient heading — matches original design */}
      <h1
        className="text-4xl font-bold tracking-tight mb-2"
        style={{
          background: "linear-gradient(90deg,#e6007a,#0a5cff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Surplus Food Rescue
      </h1>
      <p className="text-brand-muted mb-10 text-lg">
        Connecting donors, recipients, and volunteers to rescue surplus food.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            title: "Donate food",
            desc: "Restaurants, hotels, and caterers list surplus food that would otherwise go to waste.",
            href: "/donor",
            accent: "border-brand-pink",
          },
          {
            title: "Order food",
            desc: "NGOs, shelters, and community kitchens claim available listings for the people they serve.",
            href: "/order",
            accent: "border-brand-blue",
          },
          {
            title: "Volunteer",
            desc: "Riders and drivers pick up from donors and deliver to recipients — or collect waste for partners.",
            href: "/volunteer",
            accent: "border-brand-pink",
          },
        ].map((card) => (
          <a
            key={card.href}
            href={card.href}
            className={`block rounded-2xl border-2 ${card.accent} bg-brand-white p-5 shadow-sm hover:shadow-md transition-shadow`}
          >
            <h2 className="font-bold text-lg text-brand-ink mb-1">{card.title}</h2>
            <p className="text-sm text-brand-muted">{card.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
