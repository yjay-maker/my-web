type ButtonProps = {
  label: string;
  onClick?: () => void;
};

export default function Button({ label, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
    >
      {label}
    </button>
  );
}
