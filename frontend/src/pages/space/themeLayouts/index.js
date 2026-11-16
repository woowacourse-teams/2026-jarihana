import climbing from './climbing';
import boardgame from './boardgame';
import dining from './dining';
import band from './band';
import study from './study';
import photo from './photo';
import { makeReferenceLayout } from '../referenceArchitecture';

export const CURRENT_LAYOUTS = Object.freeze(Object.fromEntries(Object.entries({ climbing, boardgame, dining, band, study, photo }).map(([theme, plan]) => [theme, makeReferenceLayout(plan)])));
