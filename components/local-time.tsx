"use client";

import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

type LocalTimeProps = {
  name: string;
  location: string;
};

export function LocalTime({ name, location }: LocalTimeProps) {
  const [time, setTime] = useState("—");

  useEffect(() => {
    const update = () => setTime(formatter.format(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="local-time" aria-label={`${name}'s local time is ${time}`}>
      {location} <span aria-hidden="true">/</span>{" "}
      <time suppressHydrationWarning>{time}</time>
    </span>
  );
}
