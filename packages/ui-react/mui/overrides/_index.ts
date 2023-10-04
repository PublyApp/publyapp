import type { Theme } from '@mui/material';
import _ from 'lodash';

import { defaultProps } from './_defaultProps';
import { Accordion } from './Accordion';
import { Alert } from './Alert';
import { AppBar } from './AppBar';
import { Autocomplete } from './Autocomplete';
import { Avatar } from './Avatar';
import { Backdrop } from './Backdrop';
import { Badge } from './Badge';
import { Breadcrumbs } from './Breadcrumbs';
import { Button } from './Button';
import { ButtonGroup } from './ButtonGroup';
import { Card } from './Card';
import { CheckBox } from './CheckBox';
import { Chip } from './Chip';
import { CssBaseline } from './CssBaseline';
import { DataGrid } from './DataGrid';
import { DatePicker } from './DatePicker';
import { Dialog } from './Dialog';
import { Drawer } from './Drawer';
import { Fab } from './Fab';
import { Input } from './Input';
import { List } from './List';
import { LoadingButton } from './LoadingButton';
import { Menu } from './Menu';
import { Pagination } from './Pagination';
import { Paper } from './Paper';
import { Popover } from './Popover';
import { Progress } from './Progress';
import { Radio } from './Radio';
import { Rating } from './Rating';
import { Select } from './Select';
import { Skeleton } from './Skeleton';
import { Slider } from './Slider';
import { Stepper } from './Stepper';
import { SvgIcon } from './SvgIcon';
import { Switches } from './Switch';
import { Table } from './Table';
import { Tabs } from './Tabs';
import { TextField } from './Textfield';
import { Timeline } from './Timeline';
import { ToggleButtons } from './ToggleButtons';
import { Tooltip } from './Tooltip';
import { TreeView } from './TreeView';
import { Typography } from './Typography';

export const getComponentOverrides = (theme: Theme) => {
	return _.merge(
		// FROM ZONE
		ToggleButtons(theme),
		Select(),
		Input(theme),
		List(theme),
		Paper(),
		Button(theme),
		Skeleton(theme),
		// FROM Minimals
		defaultProps(theme),
		AppBar(),
		Accordion(theme),
		Alert(theme),
		Autocomplete(theme),
		Avatar(theme),
		Backdrop(theme),
		Badge(theme),
		Breadcrumbs(theme),
		ButtonGroup(theme),
		Card(theme),
		CheckBox(theme),
		Chip(theme),
		CssBaseline(),
		DataGrid(theme),
		DatePicker(theme),
		Dialog(theme),
		Drawer(theme),
		Fab(theme),
		LoadingButton(),
		Menu(theme),
		Pagination(theme),
		Popover(theme),
		Progress(theme),
		Radio(theme),
		Rating(theme),
		Slider(theme),
		Stepper(theme),
		SvgIcon(),
		Switches(theme),
		Table(theme),
		Tabs(theme),
		TextField(theme),
		Timeline(theme),
		Tooltip(theme),
		TreeView(theme),
		Typography(theme),
	);
};
