import { useTranslation } from 'react-i18next';
import { useUiStore, type CommunityTab } from '@/store/uiStore';
import { Modal, TabPanel, Tabs } from '@/shared/ui';
import { OnlineLeaderboard } from '@/features/leaderboard/OnlineLeaderboard';
import { DailyPanel } from '@/features/daily-challenge/DailyPanel';
import { FriendsPanel } from '@/features/friends/FriendsPanel';
import { ProfilePanel } from '@/features/profile/ProfilePanel';

const TABS: readonly CommunityTab[] = ['leaderboard', 'daily', 'friends', 'profile'];
const ID = 'community';

/** Online features: leaderboards, daily challenge, friends and profiles. */
export function CommunityModal() {
  const { t } = useTranslation();
  const community = useUiStore((s) => s.community);
  const open = useUiStore((s) => s.openCommunity);
  const close = useUiStore((s) => s.closeCommunity);
  if (!community) return null;

  return (
    <Modal open onClose={close} size="lg" title={t('community.title')} className="sm:max-w-3xl">
      <div className="-mx-5 -my-4">
        <Tabs
          items={TABS.map((id) => ({ id, label: t(`community.tabs.${id}`) }))}
          value={community.tab}
          onChange={(tab) => open(tab)}
          ariaLabel={t('community.title')}
          idPrefix={ID}
          className="px-3"
        />
        <TabPanel idPrefix={ID} id={community.tab} className="min-h-[320px]">
          {community.tab === 'leaderboard' && <OnlineLeaderboard />}
          {community.tab === 'daily' && <DailyPanel />}
          {community.tab === 'friends' && <FriendsPanel />}
          {community.tab === 'profile' && <ProfilePanel nickname={community.nickname} />}
        </TabPanel>
      </div>
    </Modal>
  );
}
