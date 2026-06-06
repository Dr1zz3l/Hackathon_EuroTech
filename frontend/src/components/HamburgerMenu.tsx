export function HamburgerMenu() {
  return (
    <button
      className="flex flex-col justify-center items-center w-11 h-11 bg-white rounded-full shadow-lg gap-[5px] touch-manipulation active:bg-gray-50"
      aria-label="Open menu"
    >
      <span className="block w-[18px] h-[2px] bg-gray-700 rounded-full" />
      <span className="block w-[18px] h-[2px] bg-gray-700 rounded-full" />
      <span className="block w-[18px] h-[2px] bg-gray-700 rounded-full" />
    </button>
  )
}
