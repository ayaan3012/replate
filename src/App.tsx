import { BrowserRouter, Routes, Route } from "react-router-dom";
import Nav from "@/components/Nav";
import Home from "@/pages/Home";
import Donor from "@/pages/Donor";
import Order from "@/pages/Order";
import Volunteer from "@/pages/Volunteer";
import Hub from "@/pages/Hub";

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      {/* pt-6 clears the 6px top accent bar */}
      <main className="pt-6 max-w-4xl mx-auto px-4 pb-16">
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/donor"     element={<Donor />} />
          <Route path="/order"     element={<Order />} />
          <Route path="/volunteer" element={<Volunteer />} />
          <Route path="/hub"       element={<Hub />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
