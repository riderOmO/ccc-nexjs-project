/* eslint-disable @next/next/no-img-element */
"use client";

import React, { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { icons } from "lucide-react";
import { BigButton } from "../components/BigButton";

/* eslint-disable react/jsx-key */
const TABS: [ReactNode, string, keyof typeof icons, string][] = [
  ["Sign", "/connected/Sign", "Signature", "text-orange-500"],
  ["Transfer", "/connected/Transfer", "ArrowLeftRight", "text-lime-500"],
  ["bonding curve trade", "/connected/TransferXUdt", "BadgeCent", "text-emerald-500"],
  ["bonding curve V2 trade", "/connected/v2Trade", "BadgeCent", "text-emerald-500"],
];
/* eslint-enable react/jsx-key */

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TABS.forEach(([_, path]) => router.prefetch(path));
  }, [router]);

  return (
    <div className="flex flex-wrap justify-center gap-8 px-4 lg:px-16">
      {TABS.map(([name, link, iconName, classes]) => (
        <BigButton
          key={link}
          size="sm"
          iconName={iconName}
          onClick={() => router.push(link)}
          className={classes}
        >
          {name}
        </BigButton>
      ))}
    </div>
  );
}
