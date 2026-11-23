export interface AgeIndicator {
  color: string;
  bgColor: string;
  label: string;
  tooltip: string;
}

export function getAgeIndicator(year: number | null): AgeIndicator {
  if (!year)
    return {
      color: "text-gray-600",
      bgColor: "bg-gray-100",
      label: "Year unknown",
      tooltip: "Year unknown",
    };

  const age = new Date().getFullYear() - year;

  if (age < 5) {
    return {
      color: "text-green-800",
      bgColor: "bg-green-100",
      label: "Under 5 years",
      tooltip: `${age} year${age !== 1 ? "s" : ""} old`,
    };
  } else if (age < 10) {
    return {
      color: "text-yellow-800",
      bgColor: "bg-yellow-100",
      label: "5–9 years",
      tooltip: `${age} years old`,
    };
  } else if (age < 20) {
    return {
      color: "text-orange-800",
      bgColor: "bg-orange-100",
      label: "10–19 years",
      tooltip: `${age} years old`,
    };
  } else if (age < 50) {
    return {
      color: "text-red-800",
      bgColor: "bg-red-100",
      label: "20–49 years",
      tooltip: `${age} years old`,
    };
  } else {
    return {
      color: "text-red-800",
      bgColor: "bg-red-200",
      label: "50+ years",
      tooltip: `${age} years old`,
    };
  }
}
