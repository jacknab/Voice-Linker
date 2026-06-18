import { useEffect } from "react";

function setMetaByName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export interface SEOProps {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}

export function useSEO({ title, description, canonical, ogImage }: SEOProps) {
  useEffect(() => {
    document.title = title;

    if (description) {
      setMetaByName("description", description);
    }

    // Open Graph
    setMetaByProperty("og:title", title);
    if (description) setMetaByProperty("og:description", description);
    if (canonical) {
      const fullUrl = canonical.startsWith("http")
        ? canonical
        : `${window.location.protocol}//${window.location.host}${canonical}`;
      setMetaByProperty("og:url", fullUrl);
      setCanonical(fullUrl);
    }
    if (ogImage) {
      const imgUrl = ogImage.startsWith("http")
        ? ogImage
        : `${window.location.protocol}//${window.location.host}${ogImage}`;
      setMetaByProperty("og:image", imgUrl);
      setMetaByName("twitter:image", imgUrl);
    }

    // Twitter Card
    setMetaByName("twitter:title", title);
    if (description) setMetaByName("twitter:description", description);
  }, [title, description, canonical, ogImage]);
}
