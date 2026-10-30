import { MessageCircle } from "lucide-react";

export function SparringCreateIcon() {
  return (
    <span className="sparring-create-icon" aria-hidden="true">
      <MessageCircle className="sparring-create-icon__back" size={24} strokeWidth={1.7} />
      <MessageCircle className="sparring-create-icon__front" size={25} strokeWidth={1.7} />
    </span>
  );
}
