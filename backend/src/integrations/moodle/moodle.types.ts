/** Datos que devuelven los servicios web de local_iinicia. */
export interface MoodleActivity { cmid: number; name: string; modname: string; url: string; duedate: number; completed: boolean }
export interface MoodleSection { id: number; name: string; activities: MoodleActivity[] }
export interface MoodleCourse {
  id: number; fullname: string; shortname: string; summary: string; progress: number; url: string; sections: MoodleSection[];
}
