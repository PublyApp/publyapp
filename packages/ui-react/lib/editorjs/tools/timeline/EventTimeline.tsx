/* eslint-disable react/destructuring-assignment */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';

import Timeline from '@mui/lab/Timeline';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import type { SxProps } from '@mui/material';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
// import { makeStyles } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

const DEFAULT_INITIAL_DATA = () => {
	return {
		events: [
			{
				time: 'Time',
				description: 'Description',
			},
		],
	};
};

const styles = {
	root: {
		paddingTop: '8px',
		backgroundColor: '#efefef',
	},
	timelinedot: {
		boxShadow: 'none',
		marginTop: '20px',
	},
	time: {
		flex: '0.2',
		padding: '8px',
		marginTop: '6px',
		textOverflow: 'ellipsis',
	},
	oppositeInButton: {
		flex: '0.14',
	},
	addButton: {
		boxShadow: 'none',
		paddingLeft: '14px',
		paddingRight: '14px',
	},
	description: {
		padding: '8px',
		width: '400px',
		textOverflow: 'ellipsis',
	},
	addButtonText: {
		color: '#FFFFFF',
		fontSize: '1.3rem',
	},
} satisfies Record<string, SxProps>;

const EventTimeline = (props: any) => {
	// const classes = useStyles();

	const [timelineData, setTimelineData] = React.useState(
		props.data.events.length > 0 ? props.data : DEFAULT_INITIAL_DATA,
	);

	const updateTimelineData = (newData: any) => {
		setTimelineData(newData);

		if (props.onDataChange) {
			// Inform editorjs about data change
			props.onDataChange(newData);
		}
	};

	const onAddEvent = (_e: any) => {
		const newData = {
			...timelineData,
		};
		newData.events.push({
			time: 'Time',
			description: 'Description',
		});
		updateTimelineData(newData);
	};

	const onContentChange = (index: any, fieldName: any) => {
		return (e: any) => {
			const newData = {
				...timelineData,
			};
			newData.events[index][fieldName] = e.currentTarget.textContent;
			updateTimelineData(newData);
		};
	};

	return (
		<Box sx={styles.root}>
			<Timeline /* align="left" */>
				{timelineData.events.map((event: any, index: any) => {
					return (
						// eslint-disable-next-line react/no-array-index-key
						<TimelineItem key={index}>
							<TimelineOppositeContent sx={styles.time}>
								<Typography
									color="textSecondary"
									onBlur={onContentChange(index, 'time')}
									suppressContentEditableWarning={!props.readOnly}
									contentEditable={!props.readOnly}
								>
									{event.time}
								</Typography>
							</TimelineOppositeContent>
							<TimelineSeparator>
								<TimelineDot sx={styles.timelinedot} />
								<TimelineConnector />
							</TimelineSeparator>
							<TimelineContent>
								<Paper elevation={3} sx={styles.description}>
									<Typography
										color="primary"
										onBlur={onContentChange(index, 'description')}
										suppressContentEditableWarning={!props.readOnly}
										contentEditable={!props.readOnly}
									>
										{event.description}
									</Typography>
								</Paper>
							</TimelineContent>
						</TimelineItem>
					);
				})}
				{!props.readOnly && (
					<TimelineItem>
						<TimelineOppositeContent sx={styles.oppositeInButton} />
						<TimelineSeparator>
							<TimelineDot color="primary" sx={styles.addButton} onClick={onAddEvent}>
								<Typography sx={styles.addButtonText}> + </Typography>
							</TimelineDot>
						</TimelineSeparator>
						<TimelineContent />
					</TimelineItem>
				)}
			</Timeline>
		</Box>
	);
};

export default EventTimeline;
