export interface VideoContent {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  pubDate: string;
  category: 'edizioni_tg' | 'programmi' | 'sport' | 'cronaca' | 'politica' | 'cultura' | 'ambiente' | 'all';
  programCategory?: string;
  duration?: string;
}

export interface ProgramCategory {
  id: string;
  name: string;
  thumbnail: string;
  videoCount: number;
}

export interface ProgramSchedule {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  isLive: boolean;
  category?: string;
}

export interface RSSItem {
  title: string[];
  description: string[];
  link: string[];
  pubDate: string[];
  'media:content'?: {
    $: {
      url: string;
    };
  }[];
  'media:thumbnail'?: {
    $: {
      url: string;
    };
  }[];
  enclosure?: {
    $: {
      url: string;
      type: string;
    };
  }[];
}

export interface ScheduleXMLItem {
  titolo?: string[];
  descrizione?: string[];
  inizio?: string[];
  fine?: string[];
  categoria?: string[];
}

export interface BreakingNewsItem {
  id: number;
  titolo: string;
  descrizione: string;
  url: string | null;
  attiva: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  link: string;
  pubDate: Date;
  author: string;
  category: string;
  thumbnail: string;
  description: string;
  content: string;
  videoUrl?: string;
}
