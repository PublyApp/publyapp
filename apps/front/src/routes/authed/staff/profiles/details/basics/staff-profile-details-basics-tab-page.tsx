import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import capitalize from 'lodash/capitalize';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useScrollspy } from '#app/hooks/use-scrollspy.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { useFindStaffPermissions } from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';

import type { StaffProfileDetailsOutletContext } from '../_layout/staff-profile-details-layout';
import {
	StaffProfilePermissionsToc,
	type TocSection,
} from './components/staff-profile-permissions-toc';
import StaffProfileBasicInfos from './parts/staff-profile-basic-infos';
import StaffProfilePermissions, {
	getPermissionModuleId,
	getStaffPermissionGroups,
} from './parts/staff-profile-permissions';

const StaffProfileDetailsBasicsTabPage = () => {
	const { t, currentLang } = useTranslate();
	const { profileId } = useParams();
	const { profileName } = useOutletContext<StaffProfileDetailsOutletContext>();

	const permissionsQuery = useFindStaffPermissions({
		variables: {
			language: currentLang.value,
		},
	});

	const permissionGroups = useMemo(() => {
		// We derive ToC sections from the permissions catalog so the ToC matches the rendered modules.
		// This stays stable thanks to deterministic sorting in getStaffPermissionGroups().
		const apiData = (permissionsQuery.data?.additionalData ?? {}) as Record<
			string,
			Record<string, unknown>
		>;
		return getStaffPermissionGroups(apiData as never);
	}, [permissionsQuery.data]);

	const tocSections: TocSection[] = useMemo(() => {
		return [
			{ id: 'basic-infos', label: t('basic-infos'), level: 1 },
			{ id: 'permissions', label: t('permissions'), level: 1 },
			...permissionGroups.map((group) => {
				return {
					id: getPermissionModuleId(group.moduleKey),
					label: group.module,
					level: 2,
				};
			}),
		];
	}, [t, permissionGroups]);

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
			let nextSpacerHeight = 0;

			if (lastSectionId) {
				const lastHeading = document.getElementById(lastSectionId);
				const spacerEl = spacerRef.current;

				if (lastHeading && spacerEl) {
					const viewportHeight = window.innerHeight;
					const lastHeadingTop =
						lastHeading.getBoundingClientRect().top + window.scrollY;
					const articleEnd =
						spacerEl.getBoundingClientRect().top + window.scrollY;

					const contentBelowLastHeading = articleEnd - lastHeadingTop;
					const minSpaceNeeded = viewportHeight - offset;

					nextSpacerHeight = Math.max(
						0,
						minSpaceNeeded - contentBelowLastHeading,
					);
				}
			}

			setSpacerHeight(nextSpacerHeight);
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
