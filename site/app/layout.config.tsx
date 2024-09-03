import { pageTree } from "@/app/source";
import { type HomeLayoutProps } from "fumadocs-ui/home-layout";
import { type DocsLayoutProps } from "fumadocs-ui/layout";
import { BookIcon, GithubIcon } from "lucide-react";

// shared configuration
export const baseOptions: HomeLayoutProps = {
  nav: {
    title: "Synthlet",
  },
  links: [
    {
      text: "Repository",
      icon: <GithubIcon />,
      url: "https://github.com/danigb/synthlet",
    },
    {
      text: "Documentation",
      icon: <BookIcon />,
      url: "/docs",
      active: "nested-url",
    },
  ],
};

// docs layout configuration
export const docsOptions: DocsLayoutProps = {
  ...baseOptions,
  tree: pageTree,
};
