import { memo } from 'react';
import styles from './MyCourseList.module.scss';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';

interface CourseItem {
  shifu_bid: string;
  title: string;
  avatar: string;
  description: string;
  is_owned: boolean;
}

interface MyCourseListProps {
  courses: CourseItem[];
  currentCourseBid: string;
  onCourseSelect: (shifu_bid: string) => void;
}

export const MyCourseList = memo(function MyCourseList({
  courses,
  currentCourseBid,
  onCourseSelect,
}: MyCourseListProps) {
  const { t } = useTranslation();

  if (!courses || courses.length === 0) {
    return null;
  }

  return (
    <div className={styles.myCourseList}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          {t('module.user.myCourses')}
        </h3>
      </div>
      <div className={styles.courseList}>
        {courses.map(course => {
          const isActive = course.shifu_bid === currentCourseBid;
          return (
            <button
              key={course.shifu_bid}
              type='button'
              className={`${styles.courseItem} ${isActive ? styles.courseItemActive : ''}`}
              onClick={() => onCourseSelect(course.shifu_bid)}
            >
              <div className={styles.courseIcon}>
                {course.avatar ? (
                  <img
                    src={course.avatar}
                    alt={course.title}
                    className={styles.courseAvatar}
                  />
                ) : (
                  <BookOpen className={styles.courseIconDefault} size={16} />
                )}
              </div>
              <div className={styles.courseInfo}>
                <span className={styles.courseTitle}>{course.title}</span>
                {course.is_owned && (
                  <span className={styles.ownedBadge}>own</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default MyCourseList;
