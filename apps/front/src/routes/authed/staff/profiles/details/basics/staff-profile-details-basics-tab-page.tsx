import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import capitalize from 'lodash/capitalize';

import { useScrollspy } from '#app/hooks/use-scrollspy.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import StaffProfileBasicInfos from './parts/staff-profile-basic-infos';
import StaffProfilePermissions, {
	getPermissionModuleId,
	STAFF_PROFILE_PERMISSION_MODULES,
} from './parts/staff-profile-permissions';
import {
	StaffProfilePermissionsToc,
	type TocSection,
} from './components/staff-profile-permissions-toc';
import type { StaffProfileDetailsOutletContext } from '../_layout/staff-profile-details-layout';

const StaffProfileDetailsBasicsTabPage = () => {
	const { t } = useTranslate();
	const { profileId } = useParams();
	const { profileName } = useOutletContext<StaffProfileDetailsOutletContext>();

	const tocSections: TocSection[] = useMemo(() => {
		return [
			{ id: 'basic-infos', label: t('basic-infos'), level: 1 },
			{ id: 'permissions', label: t('permissions'), level: 1 },
			...STAFF_PROFILE_PERMISSION_MODULES.map((moduleName) => {
				return {
					id: getPermissionModuleId(moduleName),
					label: moduleName,
					level: 2,
				};
			}),
		];
	}, [t]);

	const activeSection = useScrollspy({
		sectionIds: tocSections.map((s) => s.id),
		offset: 120,
		// useScrollspy already prepends the top offset (`-${offset}px 0px ...`).
		// Provide only the bottom margin value to avoid generating an invalid 4+ value shorthand.
		rootMargin: '-70%',
	});

	const scrollToSection = (id: string) => {
		const el = document.getElementById(id);
		if (!el) return;
		const offset = 120;
		const elementPosition = el.getBoundingClientRect().top;
		const offsetPosition = elementPosition + window.scrollY - offset;
		window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
	};

	const lastSectionId = tocSections[tocSections.length - 1]?.id ?? null;

	return (
		<Box>
			<CustomBreadcrumbs
				heading={profileName}
				links={[
					{
						name: capitalize(t('profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: profileName,
						href: FRONT_PATH_NAMES.staff.profiles.details(profileId).root,
					},
					{
						name: t('basics-and-permissions'),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Box
				sx={{
					display: 'grid',
					gap: 3,
					alignItems: 'start',
					gridTemplateColumns: {
						xs: '1fr',
						lg: 'minmax(0, 1fr) 280px',
					},
				}}
			>
				{/* Main content */}
				<Stack spacing={5} sx={{ minWidth: 0 }}>
					<Box id="basic-infos" sx={{ scrollMarginTop: 120 }}>
						<StaffProfileBasicInfos />
					</Box>

					<Box id="permissions" sx={{ scrollMarginTop: 120 }}>
						<StaffProfilePermissions />
					</Box>

					<TocBottomSpacer lastSectionId={lastSectionId} offset={120} />
				</Stack>

				<StaffProfilePermissionsToc
					sections={tocSections}
					activeId={activeSection}
					onNavigate={scrollToSection}
				/>
			</Box>
		</Box>
	);
};

export default StaffProfileDetailsBasicsTabPage;

const TocBottomSpacer = ({
	lastSectionId,
	offset,
}: {
	lastSectionId: string | null;
	offset: number;
}) => {
	const [spacerHeight, setSpacerHeight] = useState(0);
	const spacerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const calculateSpacer = () => {
			if (!lastSectionId) {
				setSpacerHeight(0);
				return;
			}

			const lastHeading = document.getElementById(lastSectionId);
			if (!lastHeading || !spacerRef.current) {
				setSpacerHeight(0);
				return;
			}

			const viewportHeight = window.innerHeight;
			const lastHeadingTop =
				lastHeading.getBoundingClientRect().top + window.scrollY;
			const articleEnd =
				spacerRef.current.getBoundingClientRect().top + window.scrollY;

			const contentBelowLastHeading = articleEnd - lastHeadingTop;
			const minSpaceNeeded = viewportHeight - offset;
			const neededHeight = Math.max(
				0,
				minSpaceNeeded - contentBelowLastHeading,
			);

			setSpacerHeight(neededHeight);
		};

		const timer = window.setTimeout(calculateSpacer, 100);
		window.addEventListener('resize', calculateSpacer);

		return () => {
			window.clearTimeout(timer);
			window.removeEventListener('resize', calculateSpacer);
		};
	}, [lastSectionId, offset]);

	return (
		<Box ref={spacerRef} aria-hidden="true" sx={{ height: spacerHeight }} />
	);
};
