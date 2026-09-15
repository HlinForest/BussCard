/** 共用类型：与桌面版 carddeck/db.py 字段一一对应，缺一不可。 */

export interface ContactFields {
  name: string;
  company: string;
  title: string;
  phone1: string;
  phone2: string;
  email: string;
  address: string;
  business: string;
  event: string;
  met_at: string;
  notes: string;
  tags_printed: string[];
  tags_inferred: string[];
}

export interface Contact extends ContactFields {
  id: number;
  status: string;
  photo_path: string;
  crop_path: string;
  search_text: string;
  embedding: string;
  created_at: number;
  updated_at: number;
}

export type NewContact = ContactFields & {
  status?: string;
  photo_path?: string;
  crop_path?: string;
  embedding?: string;
};

export interface Box {
  x: number; // 0-1000 相对坐标
  y: number;
  w: number;
  h: number;
  quad?: number[][];
}

export interface DupeCandidate {
  id: number;
  name: string;
  company: string;
  phone1: string;
  email: string;
  reason: string;
}

export interface ContactDraft {
  box: Box | null;
  crop_path: string; // 相对路径；整图模式为空
  fields: ContactFields & { status: string; _error?: string; _mock?: boolean };
  issues: string[];
  duplicates: DupeCandidate[];
}

export interface SearchHit {
  contact: Contact;
  score: number;
  reasons: string[];
}

export interface DupeGroup {
  reason: string;
  contacts: Contact[];
}

export interface LlmConfig {
  api_url: string;
  api_key: string;
  model: string;
}

export type LlmProviderId = 'deepseek' | 'dashscope' | 'openai' | 'megmeet' | 'custom';

export const PROVIDERS: Record<Exclude<LlmProviderId, 'custom'>, string> = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  megmeet: 'https://tokenkey.megmeet.com/v1/chat/completions',
};

export const BACKUP_VERSION = 2;

export interface BackupV2 {
  version: 2;
  app: 'busscard-mobile';
  exported_at: number;
  contacts: Contact[];
  images: Array<{ contact_id: number; kind: 'photo' | 'crop'; path: string; data_base64: string }>;
}

export const EXCEL_HEADERS = ['姓名', '公司', '职位', '电话1', '电话2', '邮箱', '地址', '业务', '结识展会',
  '结识时间', '备注', '印刷标签', '推断标签', '状态'];

export const EXCEL_KEYS: Array<keyof Contact> = ['name', 'company', 'title', 'phone1', 'phone2', 'email',
  'address', 'business', 'event', 'met_at', 'notes', 'tags_printed', 'tags_inferred', 'status'];
