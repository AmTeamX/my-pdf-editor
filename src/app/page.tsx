import Link from "next/link";

export default function Home() {
  return (
    <div className="w-screen h-screen flex flex-col text-center items-center justify-center space-y-4">
      <h1 className="text-2xl">POC Custom PDF Editor CS</h1>
      <h2 className="text-xl">Test By Click This Button</h2>
      <Link href='/manage-files'>
        <div className="font-black bg-green-500 p-2 rounded-xl">Go To Main Page</div>
      </Link>
    </div>
  );
}
